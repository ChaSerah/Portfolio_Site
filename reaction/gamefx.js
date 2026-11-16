// 게임 화면 C 스타일 HUD (canvas) — 시안
// 각 반쪽 화면 위에 모서리 브래킷·상태 태그·승리 칸을 그리고, 가운데 띠도 canvas로 그림.
// 반쪽 화면 안에 넣기 때문에 위쪽 플레이어 화면은 CSS 회전을 그대로 따라감.
(() => {
  const AQUA = "#58d5f2";
  const PINK = "#ff8fb7";
  const VIOLET = "#a77bff";
  const game = document.getElementById("game");
  const halves = [...game.querySelectorAll(".half")];
  const divider = game.querySelector(".divider");
  const dprOf = () => Math.min(window.devicePixelRatio || 1, 3);

  const mk = (host, cls) => {
    const c = document.createElement("canvas");
    c.className = cls;
    c.setAttribute("aria-hidden", "true");
    host.append(c);
    return c;
  };
  const hud = halves.map((h) => mk(h, "hud"));
  const bar = mk(divider, "hud-bar");

  const prep = (c, w, h) => {
    const d = dprOf();
    c.width = Math.round(w * d);
    c.height = Math.round(h * d);
    const x = c.getContext("2d");
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, w, h);
    return x;
  };

  const poly = (x, pts, close = false) => {
    x.beginPath();
    pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    if (close) x.closePath();
  };

  const font = (px, weight = 700) => `${weight} ${px}px "Chakra Petch", "IBM Plex Sans KR", sans-serif`;

  function drawHalf(i) {
    const h = halves[i];
    const w = h.clientWidth;
    const hh = h.clientHeight;
    if (!w || !hh) return;
    const x = prep(hud[i], w, hh);
    const phase = game.dataset.phase || "";
    const onGo = phase === "go" && !h.classList.contains("is-done") && !h.classList.contains("is-foul");
    const isP2 = h.classList.contains("half-p2");
    const pc = isP2 ? PINK : AQUA;
    const ink = onGo ? "rgba(3, 30, 20, 0.6)" : pc;
    const inkSoft = onGo ? "rgba(3, 30, 20, 0.35)" : isP2 ? "rgba(255, 143, 183, 0.5)" : "rgba(88, 213, 242, 0.5)";

    // 1) 네 모서리 브래킷 (모서리를 깎은 L자)
    const m = 14;
    const arm = 34;
    const cut = 9;
    x.lineWidth = 2;
    x.lineJoin = "miter";
    x.strokeStyle = ink;
    x.shadowColor = onGo ? "transparent" : pc;
    x.shadowBlur = onGo ? 0 : 8;
    [
      [[m, m + arm], [m, m + cut], [m + cut, m], [m + arm, m]],
      [[w - m - arm, m], [w - m, m], [w - m, m + arm]],
      [[m, hh - m - arm], [m, hh - m], [m + arm, hh - m]],
      [[w - m - arm, hh - m], [w - m - cut, hh - m], [w - m, hh - m - cut], [w - m, hh - m - arm]],
    ].forEach((pts) => {
      poly(x, pts);
      x.stroke();
    });
    x.shadowBlur = 0;

    // 2) 왼쪽 위 상태 태그
    const status =
      phase === "go" ? (onGo ? "GO" : "LOCKED") :
      phase === "waiting" ? (h.classList.contains("is-foul") ? "FOUL" : "STANDBY") :
      phase === "roundEnd" ? (h.classList.contains("is-winner") ? "WIN" : h.classList.contains("is-foul") ? "FOUL" : "LOSE") :
      phase === "intro" ? "READY" : "";
    const tagX = m + 14;
    const tagY = m + 14;
    x.font = font(10);
    if ("letterSpacing" in x) x.letterSpacing = "2px";
    const label = isP2 ? "P2" : "P1";
    const tw = x.measureText(label).width + 14;
    poly(x, [[tagX, tagY], [tagX + tw, tagY], [tagX + tw, tagY + 12], [tagX + tw - 5, tagY + 17], [tagX, tagY + 17]], true);
    x.fillStyle = ink;
    x.fill();
    x.fillStyle = onGo ? "#4cf0c4" : "#070c1c";
    x.textBaseline = "middle";
    x.textAlign = "left";
    x.fillText(label, tagX + 6, tagY + 9);
    x.fillStyle = ink;
    x.fillText(`// ${status}`, tagX + tw + 8, tagY + 9);

    // 3) 오른쪽 위 사선 줄무늬
    x.fillStyle = inkSoft;
    for (let k = 0; k < 4; k++) {
      const sx = w - m - 52 + k * 9;
      poly(x, [[sx + 3, tagY + 2], [sx + 8, tagY + 2], [sx + 5, tagY + 8], [sx, tagY + 8]], true);
      x.fill();
    }

    // 4) 아래(가운데 띠 쪽) 승리 칸
    const label2 = document.getElementById("round-label")?.textContent || "";
    const total = Number((label2.match(/\/(\d+)/) || [])[1]) || 5;
    const wins = Number((h.querySelector(".h-score")?.textContent.match(/\d+/) || [0])[0]);
    const pw = 22;
    const ph = 6;
    const gap = 6;
    const rowW = total * pw + (total - 1) * gap;
    let px = (w - rowW) / 2;
    const py = hh - m - 14;
    for (let k = 0; k < total; k++) {
      poly(x, [[px + 3, py], [px + pw, py], [px + pw - 3, py + ph], [px, py + ph]], true);
      if (k < wins) {
        x.fillStyle = ink;
        x.shadowColor = onGo ? "transparent" : pc;
        x.shadowBlur = onGo ? 0 : 6;
        x.fill();
        x.shadowBlur = 0;
      } else {
        x.strokeStyle = inkSoft;
        x.lineWidth = 1;
        x.stroke();
      }
      px += pw + gap;
    }
    x.font = font(9);
    x.fillStyle = inkSoft;
    x.textAlign = "center";
    x.fillText(`WINS ${wins}/${total}`, w / 2, py - 10);
  }

  function drawBar() {
    const w = divider.clientWidth;
    const hh = divider.clientHeight;
    if (!w || !hh) return;
    const x = prep(bar, w, hh);
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, PINK);
    g.addColorStop(0.5, VIOLET);
    g.addColorStop(1, AQUA);
    x.fillStyle = "#070c1c";
    x.fillRect(0, 0, w, hh);
    x.strokeStyle = g;
    x.lineWidth = 1.5;
    x.shadowColor = VIOLET;
    x.shadowBlur = 6;
    [0.75, hh - 0.75].forEach((y) => {
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(w, y);
      x.stroke();
    });
    // 가운데 ROUND 프레임
    const fw = 128;
    const fx = (w - fw) / 2;
    const fy = 6;
    const fh = hh - 12;
    poly(x, [[fx + 8, fy], [fx + fw - 8, fy], [fx + fw, fy + fh / 2], [fx + fw - 8, fy + fh], [fx + 8, fy + fh], [fx, fy + fh / 2]], true);
    x.fillStyle = "#101634";
    x.fill();
    x.strokeStyle = g;
    x.stroke();
    x.shadowBlur = 0;
    // 양옆 회로 선과 점
    x.strokeStyle = "rgba(127, 140, 255, 0.7)";
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(24, hh / 2);
    x.lineTo(fx - 10, hh / 2);
    x.moveTo(fx + fw + 10, hh / 2);
    x.lineTo(w - 64, hh / 2);
    x.stroke();
    x.fillStyle = "#b9a8ff";
    [24, fx - 10, fx + fw + 10, w - 64].forEach((cx) => {
      x.beginPath();
      x.arc(cx, hh / 2, 2.4, 0, Math.PI * 2);
      x.fill();
    });
    // 종료 버튼 자리 프레임
    const qx = w - 48;
    const qs = hh - 12;
    poly(x, [[qx, fy], [qx + qs - 6, fy], [qx + qs, fy + 6], [qx + qs, fy + qs], [qx + 6, fy + qs], [qx, fy + qs - 6]], true);
    x.fillStyle = "#0c1230";
    x.fill();
    x.strokeStyle = "rgba(167, 123, 255, 0.8)";
    x.lineWidth = 1.5;
    x.stroke();
    // ROUND 글자
    const rl = document.getElementById("round-label");
    x.font = font(12);
    if ("letterSpacing" in x) x.letterSpacing = "3px";
    x.fillStyle = "#dfe6ff";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(rl?.textContent || "", w / 2 + 1.5, hh / 2 + 0.5);
  }

  function renderAll() {
    if (!game.classList.contains("is-active")) return;
    halves.forEach((_, i) => drawHalf(i));
    drawBar();
  }

  const mo = new MutationObserver(() => requestAnimationFrame(renderAll));
  mo.observe(game, { attributes: true, attributeFilter: ["data-phase", "class"], subtree: true, childList: true, characterData: true });
  addEventListener("resize", renderAll);
  document.fonts?.ready.then(renderAll);
})();
