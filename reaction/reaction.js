(() => {
  "use strict";

  const API = "/api/reaction/scores";
  const GO_TIMEOUT = 1500; // 초록색 이후 제한 시간
  const MIN_HUMAN_MS = 80; // 이보다 빠르면 예측 출발(부정출발)로 처리
  const NEXT_ROUND_DELAY = 1900;
  const STORAGE_KEY = "reaction-duel:names";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const screens = ["home", "game", "result", "ranking", "qr"];
  let current = "home";
  let previous = "home";

  function show(id) {
    if (!screens.includes(id) || id === current) return;
    previous = current;
    current = id;
    for (const s of screens) document.getElementById(s).classList.toggle("is-active", s === id);
    window.scrollTo(0, 0);
    if (id === "ranking") loadBoard();
    if (id === "qr") renderQr();
  }

  // ---------------------------------------------------------------- 저장된 닉네임
  function loadNames() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveNames(p1, p2) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ p1, p2 }));
    } catch {
      /* 저장 불가 환경은 무시 */
    }
  }

  // ---------------------------------------------------------------- 게임 상태
  const gameEl = $("#game");
  const halves = [$(".half-p1", gameEl), $(".half-p2", gameEl)]; // index 0 = 아래(P1), 1 = 위(P2)
  const roundLabel = $("#round-label");

  let game = null;
  let timers = [];
  let wakeLock = null;

  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    timers.push(t);
    return t;
  };
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  function setHalf(i, { msg, time, cls } = {}) {
    const h = halves[i];
    if (msg !== undefined) $(".h-msg", h).textContent = msg;
    if (time !== undefined) $(".h-time", h).textContent = time;
    if (cls !== undefined) {
      h.classList.remove("is-foul", "is-done", "is-winner");
      if (cls) h.classList.add(...cls.split(" "));
    }
  }

  function updateScores() {
    game.players.forEach((p, i) => {
      $(".h-name", halves[i]).textContent = p.name;
      $(".h-score", halves[i]).textContent = `${p.wins}승`;
    });
    roundLabel.textContent = `ROUND ${Math.min(game.round + 1, game.rounds)}/${game.rounds}`;
  }

  const setPhase = (phase) => {
    game.phase = phase;
    gameEl.dataset.phase = phase;
  };

  async function keepAwake() {
    try {
      if ("wakeLock" in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => (wakeLock = null));
      }
    } catch {
      /* 지원하지 않는 브라우저 */
    }
  }

  function releaseAwake() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  function startGame(names, rounds) {
    clearTimers();
    game = {
      rounds,
      round: 0,
      phase: "intro",
      goAt: 0,
      taps: [null, null],
      submitted: false,
      players: names.map((name) => ({ name, results: [], wins: 0 })),
    };
    show("game");
    keepAwake();
    updateScores();
    setPhase("intro");
    let n = 3;
    const tick = () => {
      if (!game || game.phase !== "intro") return;
      if (n === 0) return startRound();
      [0, 1].forEach((i) => setHalf(i, { msg: String(n), time: "손가락을 화면 위에 준비!", cls: "" }));
      n -= 1;
      later(tick, 700);
    };
    tick();
  }

  function startRound() {
    clearTimers();
    game.taps = [null, null];
    updateScores();
    setPhase("waiting");
    [0, 1].forEach((i) => setHalf(i, { msg: "기다리세요…", time: "초록색이 되면 터치!", cls: "" }));
    const wait = 1400 + Math.random() * 3200;
    later(() => {
      requestAnimationFrame(() => {
        if (!game || game.phase !== "waiting") return;
        setPhase("go");
        game.goAt = performance.now();
        game.taps.forEach((t, i) => {
          if (!t) setHalf(i, { msg: "터치!", time: "" });
        });
        later(finishRound, GO_TIMEOUT);
      });
    }, wait);
  }

  function foul(i, label) {
    game.taps[i] = { type: "foul" };
    setHalf(i, { msg: label, time: "이번 라운드 기록 없음", cls: "is-foul" });
    navigator.vibrate?.(180);
  }

  function onTap(i, e) {
    if (!game) return;
    if (e.cancelable) e.preventDefault();
    if (game.taps[i]) return;

    if (game.phase === "waiting") {
      foul(i, "부정출발!");
      if (game.taps.every((t) => t?.type === "foul")) {
        clearTimers();
        setPhase("roundEnd");
        [0, 1].forEach((k) => setHalf(k, { msg: "둘 다 부정출발", time: "라운드를 다시 진행합니다" }));
        later(startRound, 1600);
      }
      return;
    }

    if (game.phase !== "go") return;

    const ms = e.timeStamp - game.goAt;
    if (ms < MIN_HUMAN_MS) {
      foul(i, "너무 빨라요!");
    } else {
      game.taps[i] = { type: "time", ms };
      setHalf(i, { msg: "", time: `${Math.round(ms)} ms`, cls: "is-done" });
    }
    if (game.taps.every(Boolean)) finishRound();
  }

  function finishRound() {
    if (!game || game.phase !== "go") return;
    clearTimers();
    setPhase("roundEnd");

    const taps = game.taps.map((t) => t ?? { type: "miss" });
    const ms = taps.map((t) => (t.type === "time" ? t.ms : null));

    let winner = null;
    if (ms[0] !== null && ms[1] !== null) winner = ms[0] < ms[1] ? 0 : ms[1] < ms[0] ? 1 : null;
    else if (ms[0] !== null) winner = 0;
    else if (ms[1] !== null) winner = 1;
    if (winner !== null) game.players[winner].wins += 1;

    taps.forEach((t, i) => {
      game.players[i].results.push({ type: t.type, ms: ms[i], win: winner === i });
      const time = t.type === "time" ? `${Math.round(t.ms)} ms` : t.type === "foul" ? "부정출발" : "시간 초과";
      const msg = winner === i ? "승리!" : winner === null ? "무승부" : "패배";
      setHalf(i, { msg, time, cls: winner === i ? "is-winner" : t.type === "foul" ? "is-foul" : "is-done" });
    });

    game.round += 1;
    updateScores();
    roundLabel.textContent = `ROUND ${game.round}/${game.rounds}`;
    later(game.round >= game.rounds ? endGame : startRound, NEXT_ROUND_DELAY);
  }

  function quitGame() {
    if (!game) return show("home");
    if (game.round > 0 && !confirm("게임을 종료할까요? 이번 판 기록은 저장되지 않습니다.")) return;
    clearTimers();
    releaseAwake();
    game = null;
    gameEl.dataset.phase = "";
    show("home");
  }

  // ---------------------------------------------------------------- 결과
  const fmt = (n) => (n == null ? "-" : `${Math.round(n)}`);

  function summarize(p) {
    const times = p.results.filter((r) => r.type === "time").map((r) => r.ms);
    const fouls = p.results.filter((r) => r.type === "foul").length;
    const misses = p.results.filter((r) => r.type === "miss").length;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const best = times.length ? Math.min(...times) : null;
    return { times, fouls, misses, avg, best };
  }

  function endGame() {
    releaseAwake();
    setPhase("");
    const [a, b] = game.players;
    const sa = summarize(a);
    const sb = summarize(b);
    a.summary = sa;
    b.summary = sb;

    let winner = null;
    if (a.wins !== b.wins) winner = a.wins > b.wins ? 0 : 1;
    else if (sa.avg !== null && sb.avg !== null && sa.avg !== sb.avg) winner = sa.avg < sb.avg ? 0 : 1;
    else if (sa.avg !== null && sb.avg === null) winner = 0;
    else if (sb.avg !== null && sa.avg === null) winner = 1;

    $("#result-title").textContent =
      winner === null ? "무승부!" : `${game.players[winner].name} 승리!`;

    const cards = $("#result-cards");
    cards.replaceChildren(
      ...game.players.map((p, i) => {
        const s = p.summary;
        const el = document.createElement("article");
        el.className = `card ${i === 0 ? "p1" : "p2"}${winner === i ? " win" : ""}`;
        el.innerHTML = `
          <p class="c-name"></p>
          <p class="c-avg">${fmt(s.avg)}<small> ms 평균</small></p>
          <p class="c-meta">${p.wins}승 · 최고 ${fmt(s.best)}ms<br />부정출발 ${s.fouls} · 시간초과 ${s.misses}</p>
          <p class="c-rank" data-rank></p>`;
        $(".c-name", el).textContent = `${i === 0 ? "▼" : "▲"} ${p.name}`;
        return el;
      })
    );

    const table = $("#round-table");
    const head = `<tr><th>R</th><th></th><th></th></tr>`;
    const rows = game.players[0].results
      .map((_, r) => {
        const cell = (p) => {
          const x = p.results[r];
          const text = x.type === "time" ? `${fmt(x.ms)}ms` : x.type === "foul" ? "부정출발" : "시간초과";
          const cls = x.win ? "best" : x.type === "time" ? "" : "bad";
          return `<td class="${cls}">${text}</td>`;
        };
        return `<tr><td>${r + 1}</td>${cell(game.players[0])}${cell(game.players[1])}</tr>`;
      })
      .join("");
    table.innerHTML = head + rows;
    const ths = $$("th", table);
    ths[1].textContent = game.players[0].name;
    ths[2].textContent = game.players[1].name;

    show("result");
    submitScores();
  }

  async function submitScores() {
    const status = $("#submit-status");
    if (!game || game.submitted) return;
    game.submitted = true;

    const eligible = game.players.filter((p) => p.summary.times.length >= 3);
    const skipped = game.players.filter((p) => p.summary.times.length < 3).map((p) => p.name);
    if (!eligible.length) {
      status.textContent = "유효 기록이 3회 미만이라 랭킹에 저장되지 않았어요.";
      return;
    }

    status.textContent = "기록 저장 중…";
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          players: eligible.map((p) => ({
            name: p.name,
            times: p.summary.times.map((t) => Math.round(t * 10) / 10),
            fouls: p.summary.fouls,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const cards = $$("#result-cards .card");
      for (const r of data.results || []) {
        const idx = game.players.findIndex((p) => p.name === r.name);
        if (idx < 0) continue;
        const text = `${r.newBest ? "🎉 개인 최고 기록! " : ""}전체 ${r.rank}위 / ${data.total}명`;
        $("[data-rank]", cards[idx]).textContent = text;
      }
      const notes = [...skipped, ...(data.rejected || []).map((r) => r.name)];
      status.textContent = notes.length
        ? `기록 저장 완료 (${notes.join(", ")}: 유효 기록 부족으로 제외)`
        : "기록이 랭킹에 저장되었어요.";
    } catch (err) {
      console.error(err);
      game.submitted = false;
      status.innerHTML = "";
      status.append("기록 저장에 실패했어요. ");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn btn-ghost";
      retry.style.minHeight = "2.2rem";
      retry.textContent = "다시 시도";
      retry.addEventListener("click", submitScores);
      status.append(retry);
    }
  }

  // ---------------------------------------------------------------- 랭킹
  let boardLoading = false;

  async function loadBoard() {
    if (boardLoading) return;
    boardLoading = true;
    const board = $("#board");
    const status = $("#board-status");
    status.textContent = "불러오는 중…";
    try {
      const res = await fetch(API, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const names = Object.values(loadNames()).map((n) => String(n).toLowerCase());
      board.replaceChildren(
        ...data.leaderboard.map((row) => {
          const li = document.createElement("li");
          if (names.includes(row.name.toLowerCase())) li.className = "me";
          li.innerHTML = `<span class="r"></span><span class="n"><b></b><small></small></span><span class="v"></span>`;
          $(".r", li).textContent = row.rank;
          $(".n b", li).textContent = row.name;
          $(".n small", li).textContent = `${row.games}판 · 전체 평균 ${fmt(row.average)}ms`;
          $(".v", li).innerHTML = `${fmt(row.best)}<small> ms</small>`;
          return li;
        })
      );
      status.textContent = data.total ? `총 ${data.total}명 참가` : "아직 기록이 없어요. 첫 번째 주인공이 되어보세요!";
    } catch (err) {
      console.error(err);
      status.textContent = "랭킹을 불러오지 못했어요.";
    } finally {
      boardLoading = false;
    }
  }

  // ---------------------------------------------------------------- QR
  function playUrl() {
    return location.origin + location.pathname;
  }

  function renderQr() {
    const box = $("#qr-box");
    const url = playUrl();
    $("#qr-url").textContent = url;
    if (box.dataset.url === url) return;
    box.replaceChildren();
    if (typeof window.qrcode === "function") {
      const qr = window.qrcode(0, "M");
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
      box.dataset.url = url;
    } else {
      box.textContent = "QR을 만들지 못했어요. 아래 주소로 접속하세요.";
      box.style.color = "#000";
    }
  }

  // ---------------------------------------------------------------- 이벤트
  const form = $("#setup-form");
  const stored = loadNames();
  if (stored.p1) $("#name-p1").value = stored.p1;
  if (stored.p2) $("#name-p2").value = stored.p2;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const clean = (v) => v.replace(/\s+/g, " ").trim().slice(0, 12);
    const p1 = clean($("#name-p1").value);
    const p2 = clean($("#name-p2").value);
    const err = $("#form-error");
    if (!p1 || !p2) return (err.textContent = "두 플레이어의 닉네임을 입력해주세요.");
    if (p1.toLowerCase() === p2.toLowerCase()) return (err.textContent = "서로 다른 닉네임을 사용해주세요.");
    err.textContent = "";
    document.activeElement?.blur();
    saveNames(p1, p2);
    const rounds = Number(new FormData(form).get("rounds")) || 5;
    startGame([p1, p2], rounds);
  });

  halves.forEach((h, i) => {
    h.addEventListener("pointerdown", (e) => onTap(i, e));
  });
  gameEl.addEventListener("contextmenu", (e) => e.preventDefault());
  // iOS 핀치/더블탭 확대 방지
  gameEl.addEventListener(
    "touchstart",
    (e) => {
      if (!e.target.closest("button")) e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  $("#quit").addEventListener("click", quitGame);
  $("#rematch").addEventListener("click", () => {
    if (!game) return show("home");
    startGame(game.players.map((p) => p.name), game.rounds);
  });
  $("#refresh-board").addEventListener("click", loadBoard);
  $("#print-qr").addEventListener("click", () => window.print());

  $$("[data-open]").forEach((b) => b.addEventListener("click", () => show(b.dataset.open)));
  $$("[data-back]").forEach((b) =>
    b.addEventListener("click", () => show(previous === current || previous === "game" ? "home" : previous))
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && game && current === "game") keepAwake();
  });

  // PC(마우스 환경)에서 열면 QR 화면을 먼저 보여준다. ?qr=1 로 강제 가능
  const params = new URLSearchParams(location.search);
  const isDesktop = matchMedia("(hover: hover) and (pointer: fine)").matches && navigator.maxTouchPoints === 0;
  if (params.has("qr") || (isDesktop && !params.has("play"))) {
    window.addEventListener("load", () => show("qr"));
  }
})();
