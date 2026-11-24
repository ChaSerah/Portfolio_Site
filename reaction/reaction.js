(() => {
  "use strict";

  // 시간 값은 config.js 에서 바꿈
  const T = window.GAME_CONFIG?.timing ?? {};
  const GO_TIMEOUT = T.goTimeout ?? 1500; // 신호 이후 제한 시간
  const MIN_HUMAN_MS = T.minHumanMs ?? 80; // 이보다 빠르면 예측 출발(부정출발)로 처리
  const NEXT_ROUND_DELAY = T.nextRoundDelay ?? 1900;
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

  // ---------------------------------------------------------------- 닉네임은 기억하지 않음
  // 예전 버전이 저장해 둔 닉네임이 있으면 지움 (매번 빈 입력칸으로 시작)
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 저장소를 쓸 수 없는 환경은 무시 */
  }

  // ---------------------------------------------------------------- 게임 상태
  const gameEl = $("#game");
  const halves = [$(".half-p1", gameEl), $(".half-p2", gameEl)]; // index 0 = 아래(P1), 1 = 위(P2)

  // 신호 화면을 canvas로 그림: 삼성 인터넷 다크모드는 CSS 배경색·글자색은 바꾸지만 canvas 내용은 그대로 둠.
  // 배경뿐 아니라 이름·"터치!"·승수 글자까지 canvas에 그려서 원래 색 그대로 보이게 함.
  const goColor = getComputedStyle(document.documentElement).getPropertyValue("--go").trim() || window.GAME_CONFIG?.colors.go || "#4cf0c4";
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
    let n = T.countdownFrom ?? 3;
    const tick = () => {
      if (!game || game.phase !== "intro") return;
      if (n === 0) return startRound();
      [0, 1].forEach((i) => setHalf(i, { msg: String(n), time: "손가락을 화면 위에 준비!", cls: "" }));
      n -= 1;
      later(tick, T.countdownStep ?? 700);
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
    const wait = (T.waitMin ?? 1400) + Math.random() * (T.waitRandom ?? 3200);
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
    return window.GAME_CONFIG?.share?.url || location.origin + location.pathname;
  }

  // 흰 판(모서리 깎음) 위에 QR 코드를 그림. (x, y) 위치에 size 크기
  // canvas로 그리는 이유: 삼성 인터넷 다크모드가 흰 바탕을 뒤집어 QR이 안 찍히는 일을 막음
  function drawQrPlate(ctx, url, x, y, size) {
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    const cut = size * 0.057;
    const margin = size * 0.067;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(cut, 0);
    ctx.lineTo(size, 0);
    ctx.lineTo(size, size - cut);
    ctx.lineTo(size - cut, size);
    ctx.lineTo(0, size);
    ctx.lineTo(0, cut);
    ctx.closePath();
    ctx.fill();
    const cell = (size - margin * 2) / n;
    ctx.fillStyle = "#000000";
    for (let r = 0; r < n; r++) {
      for (let k = 0; k < n; k++) {
        if (qr.isDark(r, k)) ctx.fillRect(Math.floor(margin + k * cell), Math.floor(margin + r * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.restore();
  }

  function renderQr() {
    const box = $("#qr-box");
    const url = playUrl();
    $("#qr-url").textContent = url;
    if (box.dataset.url === url) return;
    box.replaceChildren();
    if (typeof window.qrcode === "function") {
      const c = document.createElement("canvas");
      c.width = c.height = 600;
      c.setAttribute("role", "img");
      c.setAttribute("aria-label", "게임 주소 QR 코드");
      drawQrPlate(c.getContext("2d"), url, 0, 0, 600);
      box.append(c);
      box.dataset.url = url;
    } else {
      box.textContent = "QR을 만들지 못했어요. 아래 주소로 접속하세요.";
      box.style.color = "#000";
    }
  }

  // ---------------------------------------------------------------- QR 포스터 이미지
  // "이미지 저장" 버튼: 회로 배경 + 제목 + QR + 주소가 들어간 세로 포스터(1080×1500 PNG)
  const POSTER_W = 1080;
  const POSTER_H = 1500;

  async function buildPoster() {
    const COL = window.GAME_CONFIG?.colors ?? {};
    const AQUA = COL.p1 ?? "#58d5f2";
    const VIOLET = COL.violet ?? "#a77bff";
    const url = playUrl();
    await Promise.all([
      document.fonts.load('700 96px "IBM Plex Sans KR"', "반응속도대결"),
      document.fonts.load('700 30px "Chakra Petch"', "SCAN"),
      document.fonts.load('500 28px "JetBrains Mono"', "https"),
    ]).catch(() => {});

    const c = document.createElement("canvas");
    c.width = POSTER_W;
    c.height = POSTER_H;
    const x = c.getContext("2d");

    // 배경
    x.fillStyle = "#020711";
    x.fillRect(0, 0, POSTER_W, POSTER_H);
    const glow = x.createRadialGradient(POSTER_W / 2, 0, 0, POSTER_W / 2, 0, POSTER_H * 0.75);
    glow.addColorStop(0, "#0b2440");
    glow.addColorStop(1, "rgba(2, 7, 17, 0)");
    x.fillStyle = glow;
    x.fillRect(0, 0, POSTER_W, POSTER_H);
    if (window.RD_CIRCUIT) {
      x.save();
      x.globalAlpha = 0.6;
      window.RD_CIRCUIT.paintTo(x, POSTER_W, POSTER_H);
      x.restore();
    }

    // 가운데 패널 (화면과 같은 C 스타일)
    const px = 110;
    const py = 230;
    const pw = POSTER_W - px * 2;
    const ph = 1040;
    if (window.RD_FX) {
      x.save();
      x.translate(px, py);
      x.scale(2, 2);
      window.RD_FX.drawPanel(x, pw / 2, ph / 2);
      x.restore();
    }

    const text = (str, y, font, color, spacing = "0px") => {
      x.font = font;
      if ("letterSpacing" in x) x.letterSpacing = spacing;
      x.fillStyle = color;
      x.textAlign = "center";
      x.textBaseline = "alphabetic";
      x.fillText(str, POSTER_W / 2, y);
    };
    const display = '"Chakra Petch", "IBM Plex Sans KR", sans-serif';
    const body = '"IBM Plex Sans KR", sans-serif';
    text("SCAN TO PLAY", py + 100, `700 30px ${display}`, AQUA, "10px");
    text("반응속도 대결", py + 215, `700 92px ${body}`, "#f6fbff", "-2px");
    text("휴대폰 한 대로, 둘이 마주 보고 대결!", py + 280, `500 32px ${body}`, "rgba(231, 244, 255, 0.72)");

    // QR + 바깥 그라데이션 테두리
    const qs = 520;
    const qx = (POSTER_W - qs) / 2;
    const qy = py + 330;
    const g = x.createLinearGradient(qx, 0, qx + qs, 0);
    g.addColorStop(0, AQUA);
    g.addColorStop(1, VIOLET);
    const o = 16;
    const cut = 40;
    x.save();
    x.shadowColor = "rgba(127, 140, 255, 0.6)";
    x.shadowBlur = 24;
    x.strokeStyle = g;
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(qx - o + cut, qy - o);
    x.lineTo(qx + qs + o, qy - o);
    x.lineTo(qx + qs + o, qy + qs + o - cut);
    x.lineTo(qx + qs + o - cut, qy + qs + o);
    x.lineTo(qx - o, qy + qs + o);
    x.lineTo(qx - o, qy - o + cut);
    x.closePath();
    x.stroke();
    x.restore();
    if (typeof window.qrcode === "function") drawQrPlate(x, url, qx, qy, qs);

    text(url.replace(/^https?:\/\//, ""), qy + qs + 90, `500 28px "JetBrains Mono", monospace`, AQUA);
    text("1 PHONE · 2 PLAYERS", qy + qs + 150, `700 24px ${display}`, VIOLET, "8px");
    return c;
  }

  async function savePoster() {
    const btn = $("#save-qr");
    btn.disabled = true;
    try {
      const c = await buildPoster();
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const name = window.GAME_CONFIG?.share?.posterFileName || "reaction-duel-qr.png";
      const file = new File([blob], name, { type: "image/png" });
      // 휴대폰: 공유 시트(사진 저장 가능), PC: 바로 다운로드
      if (navigator.maxTouchPoints > 0 && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "반응속도 대결 QR" }).catch(() => {});
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    } finally {
      btn.disabled = false;
    }
  }
  window.RD_buildPoster = buildPoster; // 포스터를 따로 만들 때(테스트·내보내기) 사용

  // ---------------------------------------------------------------- 이벤트
  const form = $("#setup-form");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // 닉네임 입력 없이 플레이어 1(아래쪽) · 플레이어 2(위쪽)로 표시
    document.activeElement?.blur();
    const rounds = Number(new FormData(form).get("rounds")) || 5;
    startGame(["플레이어 1", "플레이어 2"], rounds);
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
  $("#save-qr").addEventListener("click", savePoster);

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
