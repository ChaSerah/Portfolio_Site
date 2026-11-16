// 반응속도 대결 게임 - 기록 저장 & 랭킹 API (Vercel Function + Upstash Redis)
//   GET  /api/reaction/scores   -> 랭킹 (개인 최고 평균 기록 순)
//   POST /api/reaction/scores   -> { players: [{ name, times: [ms, ...], fouls }] }
//
// Redis 키 (모두 "rd1p:" 접두사 — 같은 Redis를 쓰는 다른 앱과 섞이지 않게)
//   rd1p:best      ZSET  플레이어키 -> 최고 평균(ms)  (ZADD LT 로 원자적으로 갱신)
//   rd1p:names     HASH  플레이어키 -> 표시용 닉네임
//   rd1p:total     HASH  플레이어키 -> 유효 라운드 기록 합(ms)
//   rd1p:rounds    HASH  플레이어키 -> 유효 라운드 수
//   rd1p:games     HASH  플레이어키 -> 플레이한 판 수
//   rd1p:log       LIST  최근 게임 원본 기록 (최대 1000개)

const P = "rd1p:";
const MIN_ROUND_MS = 80; // 인간 한계보다 빠른 값은 부정 입력으로 간주
const MAX_ROUND_MS = 1500;
const MIN_VALID_ROUNDS = 3;
const MAX_ROUNDS = 10;
const LEADERBOARD_SIZE = 50;

const REDIS_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error("Redis is not configured");
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`redis HTTP ${res.status}`);
  const out = await res.json();
  return out.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const cleanName = (raw) =>
  String(raw ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);

export const nameKey = (name) => name.toLowerCase();

const round1 = (n) => Math.round(n * 10) / 10;

export function validatePlayer(p) {
  const name = cleanName(p?.name);
  if (!name) return { error: "닉네임이 필요합니다." };
  const times = Array.isArray(p?.times) ? p.times : [];
  const fouls = Number.isInteger(p?.fouls) ? p.fouls : 0;
  if (times.length > MAX_ROUNDS || fouls < 0 || fouls > MAX_ROUNDS) return { error: "잘못된 라운드 수입니다." };
  if (!times.every((t) => typeof t === "number" && t >= MIN_ROUND_MS && t <= MAX_ROUND_MS)) {
    return { error: "유효하지 않은 기록이 포함되어 있습니다." };
  }
  if (times.length < MIN_VALID_ROUNDS) return { error: `유효 라운드가 ${MIN_VALID_ROUNDS}회 이상이어야 합니다.` };
  const clean = times.map(round1);
  const sum = clean.reduce((a, b) => a + b, 0);
  return { name, key: nameKey(name), times: clean, fouls, sum: round1(sum), avg: round1(sum / clean.length) };
}

async function loadLeaderboard() {
  const [flat, total] = await redis([
    ["ZRANGE", `${P}best`, "0", String(LEADERBOARD_SIZE - 1), "WITHSCORES"],
    ["ZCARD", `${P}best`],
  ]);
  const keys = [];
  const best = [];
  for (let i = 0; i < flat.length; i += 2) {
    keys.push(flat[i]);
    best.push(Number(flat[i + 1]));
  }
  if (!keys.length) return { leaderboard: [], total: Number(total) || 0 };
  const [names, totals, rounds, games] = await redis([
    ["HMGET", `${P}names`, ...keys],
    ["HMGET", `${P}total`, ...keys],
    ["HMGET", `${P}rounds`, ...keys],
    ["HMGET", `${P}games`, ...keys],
  ]);
  const leaderboard = keys.map((k, i) => ({
    rank: i + 1,
    name: names[i] || k,
    best: round1(best[i]),
    average: Number(rounds[i]) ? round1(Number(totals[i]) / Number(rounds[i])) : round1(best[i]),
    games: Number(games[i]) || 1,
  }));
  return { leaderboard, total: Number(total) || 0 };
}

export async function GET() {
  try {
    return json(await loadLeaderboard());
  } catch (err) {
    console.error("leaderboard read failed", err);
    return json({ error: "랭킹을 불러오지 못했습니다." }, 500);
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "잘못된 요청입니다." }, 400);
  }

  const players = Array.isArray(body?.players) ? body.players.slice(0, 2) : [];
  if (players.length === 0) return json({ error: "플레이어 정보가 없습니다." }, 400);

  const accepted = [];
  const rejected = [];
  for (const p of players) {
    const v = validatePlayer(p);
    if (v.error) rejected.push({ name: cleanName(p?.name), reason: v.error });
    else accepted.push(v);
  }
  if (accepted.length === 0) return json({ error: rejected[0]?.reason ?? "저장할 기록이 없습니다.", rejected }, 400);
  if (accepted.length === 2 && accepted[0].key === accepted[1].key) {
    return json({ error: "두 플레이어의 닉네임이 같습니다." }, 400);
  }

  try {
    const prevBest = await redis(accepted.map((p) => ["ZSCORE", `${P}best`, p.key]));

    const now = Date.now();
    const cmds = [
      ["LPUSH", `${P}log`, JSON.stringify({ at: now, players: accepted.map(({ name, times, fouls, avg }) => ({ name, times, fouls, avg })) })],
      ["LTRIM", `${P}log`, "0", "999"],
    ];
    for (const p of accepted) {
      cmds.push(
        ["ZADD", `${P}best`, "LT", String(p.avg), p.key],
        ["HSET", `${P}names`, p.key, p.name],
        ["HINCRBYFLOAT", `${P}total`, p.key, String(p.sum)],
        ["HINCRBY", `${P}rounds`, p.key, String(p.times.length)],
        ["HINCRBY", `${P}games`, p.key, "1"]
      );
    }
    await redis(cmds);

    const ranks = await redis(accepted.flatMap((p) => [["ZRANK", `${P}best`, p.key], ["ZSCORE", `${P}best`, p.key]]));
    const board = await loadLeaderboard();
    const results = accepted.map((p, i) => ({
      name: p.name,
      avg: p.avg,
      newBest: prevBest[i] === null || p.avg < Number(prevBest[i]),
      rank: ranks[i * 2] === null ? null : Number(ranks[i * 2]) + 1,
      best: round1(Number(ranks[i * 2 + 1])),
    }));
    return json({ results, rejected, ...board });
  } catch (err) {
    console.error("score save failed", err);
    return json({ error: "기록 저장에 실패했습니다." }, 500);
  }
}
