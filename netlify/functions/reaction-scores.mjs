// 반응속도 대결 게임 - 기록 저장 & 랭킹 API
//   GET  /api/reaction/scores          -> 랭킹 (최고 평균 기록 순)
//   POST /api/reaction/scores          -> { players: [{ name, times: [ms, ...], fouls }] }
//
// 저장 구조 (Netlify Blobs, 사이트 전역 스토어 "reaction-duel")
//   games/<timestamp>-<rand>   : 게임 1판의 원본 기록 (변경되지 않음)
//   players/<nameKey>          : 플레이어별 누적 요약 (최고 평균, 전체 평균, 판수)

import { getStore } from "@netlify/blobs";

const STORE = "reaction-duel";
const MIN_ROUND_MS = 80; // 인간 한계보다 빠른 값은 부정 입력으로 간주
const MAX_ROUND_MS = 1500;
const MIN_VALID_ROUNDS = 3;
const MAX_ROUNDS = 10;
const LEADERBOARD_SIZE = 50;

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

export const nameKey = (name) => encodeURIComponent(name.toLowerCase());

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
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return { name, times: times.map(round1), fouls, avg: round1(avg) };
}

async function loadLeaderboard(store) {
  const { blobs } = await store.list({ prefix: "players/" });
  const entries = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return entries
    .filter(Boolean)
    .sort((a, b) => a.best - b.best || a.updatedAt - b.updatedAt)
    .map((e, i) => ({
      rank: i + 1,
      name: e.name,
      best: e.best,
      average: round1(e.totalMs / e.rounds),
      games: e.games,
    }));
}

export default async (req) => {
  const store = getStore({ name: STORE, consistency: "strong" });

  if (req.method === "GET") {
    try {
      const board = await loadLeaderboard(store);
      return json({ leaderboard: board.slice(0, LEADERBOARD_SIZE), total: board.length });
    } catch (err) {
      console.error("leaderboard read failed", err);
      return json({ error: "랭킹을 불러오지 못했습니다." }, 500);
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "잘못된 요청입니다." }, 400);
  }

  const players = Array.isArray(body?.players) ? body.players.slice(0, 2) : [];
  if (players.length === 0) return json({ error: "플레이어 정보가 없습니다." }, 400);

  const now = Date.now();
  const accepted = [];
  const rejected = [];
  for (const p of players) {
    const v = validatePlayer(p);
    if (v.error) rejected.push({ name: cleanName(p?.name), reason: v.error });
    else accepted.push(v);
  }
  if (accepted.length === 0) return json({ error: rejected[0]?.reason ?? "저장할 기록이 없습니다.", rejected }, 400);
  if (accepted.length === 2 && nameKey(accepted[0].name) === nameKey(accepted[1].name)) {
    return json({ error: "두 플레이어의 닉네임이 같습니다." }, 400);
  }

  try {
    const gameId = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(`games/${gameId}`, { at: now, players: accepted });

    for (const p of accepted) {
      const key = `players/${nameKey(p.name)}`;
      const prev = (await store.get(key, { type: "json" })) ?? {
        name: p.name,
        best: Infinity,
        totalMs: 0,
        rounds: 0,
        games: 0,
      };
      const improved = p.avg < prev.best;
      await store.setJSON(key, {
        name: p.name,
        best: improved ? p.avg : prev.best,
        totalMs: prev.totalMs + p.times.reduce((a, b) => a + b, 0),
        rounds: prev.rounds + p.times.length,
        games: prev.games + 1,
        updatedAt: improved ? now : prev.updatedAt ?? now,
      });
      p.newBest = improved;
    }

    const board = await loadLeaderboard(store);
    const results = accepted.map((p) => {
      const row = board.find((r) => nameKey(r.name) === nameKey(p.name));
      return { name: p.name, avg: p.avg, newBest: p.newBest, rank: row?.rank ?? null, best: row?.best ?? p.avg };
    });
    return json({ results, rejected, total: board.length, leaderboard: board.slice(0, LEADERBOARD_SIZE) });
  } catch (err) {
    console.error("score save failed", err);
    return json({ error: "기록 저장에 실패했습니다." }, 500);
  }
};

export const config = { path: "/api/reaction/scores" };
