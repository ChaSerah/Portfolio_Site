(() => {
  "use strict";

  const GO_TIMEOUT = 1500; // 초록색 이후 제한 시간
  const MIN_HUMAN_MS = 80; // 이보다 빠르면 예측 출발(부정출발)로 처리
  const NEXT_ROUND_DELAY = 1900;
  const STORAGE_KEY = "reaction-duel:names";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const screens = ["home", "game", "result", "qr"];
  let current = "home";
  let previous = "home";

  function show(id) {
    if (!screens.includes(id) || id === current) return;
    previous = current;
    current = id;
    for (const s of screens) document.getElementById(s).classList.toggle("is-active", s === id);
    window.scrollTo(0, 0);
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

  // 신호 화면을 canvas로 그림: 삼성 인터넷 다크모드는 CSS 배경색·글자색은 바꾸지만 canvas 내용은 그대로 둠.
  // 배경뿐 아니라 이름·"터치!"·승수 글자까지 canvas에 그려서 원래 색 그대로 보이게 함.
  const goColor = getComputedStyle(document.documentElement).getPropertyValue("--go").trim() || "#4cf0c4";
  const goCanvases = halves.map((h) => {
    const c = document.createElement("canvas");
    c.className = "go-fill";
    c.setAttribute("aria-hidden", "true");
    h.prepend(c);
    return c;
  });

  function paintGo(i, name, score) {
    const h = halves[i];
    const c = goCanvases[i];
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = h.clientWidth;
    const hh = h.clientHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(hh * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = goColor;
    ctx.fillRect(0, 0, w, hh);

    const fontOf = (sel) => {
      const cs = getComputedStyle($(sel, h));
      return { family: cs.fontFamily, size: parseFloat(cs.fontSize) };
    };
    const msg = fontOf(".h-msg");
    const small = fontOf(".h-name");
    const cx = w / 2;
    const cy = hh / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#03170c";
    ctx.font = `700 ${msg.size}px ${msg.family}`;
    ctx.fillText("터치!", cx, cy);
    ctx.fillStyle = "rgba(3, 23, 12, 0.7)";
    ctx.font = `800 ${small.size}px ${small.family}`;
    ctx.fillText(name, cx, cy - msg.size * 1.15);
    // 승수는 HUD(gamefx.js)의 승리 칸으로 표시
  }

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
    if (time !== undefined) {
      const el = $(".h-time", h);
      el.textContent = time;
      el.classList.toggle("is-num", /\d\s?ms$/.test(time));
    }
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
    // 신호 화면을 미리 그려 둠 (신호 순간에는 보이기만 하면 됨)
    game.players.forEach((p, i) => paintGo(i, p.name, `${p.wins}승`));
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

  // 부정출발: 그 즉시 라운드 종료, 상대에게 승점
  function foul(i, label) {
    game.taps[i] = { type: "foul", label };
    const other = 1 - i;
    if (!game.taps[other]) game.taps[other] = { type: "bye" };
    navigator.vibrate?.(180);
    finishRound(other);
  }

  function onTap(i, e) {
    if (!game) return;
    if (e.cancelable) e.preventDefault();
    if (game.taps[i]) return;

    if (game.phase === "waiting") return foul(i, "부정출발!");
    if (game.phase !== "go") return;

    const ms = e.timeStamp - game.goAt;
    if (ms < MIN_HUMAN_MS) return foul(i, "너무 빨라요!");

    game.taps[i] = { type: "time", ms };
    setHalf(i, { msg: "", time: `${Math.round(ms)} ms`, cls: "is-done" });
    if (game.taps.every(Boolean)) finishRound();
  }

  function finishRound(forcedWinner = null) {
    if (!game || (game.phase !== "go" && game.phase !== "waiting")) return;
    clearTimers();
    setPhase("roundEnd");

    const taps = game.taps.map((t) => t ?? { type: "miss" });
    const ms = taps.map((t) => (t.type === "time" ? t.ms : null));

    let winner = forcedWinner;
    if (winner === null) {
      if (ms[0] !== null && ms[1] !== null) winner = ms[0] < ms[1] ? 0 : ms[1] < ms[0] ? 1 : null;
      else if (ms[0] !== null) winner = 0;
      else if (ms[1] !== null) winner = 1;
    }
    if (winner !== null) game.players[winner].wins += 1;

    taps.forEach((t, i) => {
      game.players[i].results.push({ type: t.type, ms: ms[i], win: winner === i });
      if (t.type === "foul") {
        setHalf(i, { msg: t.label, time: "상대에게 1점", cls: "is-foul" });
        return;
      }
      const time =
        t.type === "time" ? `${Math.round(t.ms)} ms` : t.type === "bye" ? "상대 부정출발" : "시간 초과";
      const msg = winner === i ? "승리!" : winner === null ? "무승부" : "패배";
      setHalf(i, { msg, time, cls: winner === i ? "is-winner" : "is-done" });
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
          <p class="c-meta">${p.wins}승 · 최고 ${fmt(s.best)}ms<br />부정출발 ${s.fouls} · 시간초과 ${s.misses}</p>`;
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
          const text =
            x.type === "time" ? `${fmt(x.ms)}ms` : x.type === "foul" ? "부정출발" : x.type === "bye" ? "부전승" : "시간초과";
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
      // canvas로 그림: 삼성 인터넷 다크모드가 흰 바탕을 뒤집어 QR이 안 찍히는 일을 막음
      const n = qr.getModuleCount();
      const size = 600;
      const cut = 34;
      const margin = 40;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.setAttribute("role", "img");
      c.setAttribute("aria-label", "게임 주소 QR 코드");
      const x = c.getContext("2d");
      x.fillStyle = "#ffffff";
      x.beginPath();
      x.moveTo(cut, 0);
      x.lineTo(size, 0);
      x.lineTo(size, size - cut);
      x.lineTo(size - cut, size);
      x.lineTo(0, size);
      x.lineTo(0, cut);
      x.closePath();
      x.fill();
      const cell = (size - margin * 2) / n;
      x.fillStyle = "#000000";
      for (let r = 0; r < n; r++) {
        for (let k = 0; k < n; k++) {
          if (qr.isDark(r, k)) x.fillRect(Math.floor(margin + k * cell), Math.floor(margin + r * cell), Math.ceil(cell), Math.ceil(cell));
        }
      }
      box.append(c);
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
