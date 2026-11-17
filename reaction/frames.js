// 버튼·입력칸·패널·카드의 C 스타일 프레임을 canvas로 그림.
// 삼성 인터넷 다크모드는 CSS 색(테두리·배경·글자)을 임의로 어둡게 바꾸지만 canvas 내용은 그대로 두기 때문.
// 이 스크립트가 동작하면 <html>에 has-fx 클래스가 붙고, CSS 쪽 프레임은 숨겨짐.
(() => {
  // 색은 config.js 에서 바꿈
  const COL = window.GAME_CONFIG?.colors ?? {};
  const AQUA = COL.p1 ?? "#58d5f2";
  const PINK = COL.p2 ?? "#ff8fb7";
  const VIOLET = COL.violet ?? "#a77bff";
  const renders = [];

  const dprOf = () => Math.min(window.devicePixelRatio || 1, 3);

  function mount(el, pad, draw) {
    if (el.dataset.fx) return null;
    el.dataset.fx = "1";
    const c = document.createElement("canvas");
    c.className = "fx";
    c.setAttribute("aria-hidden", "true");
    c.style.left = c.style.top = `${-pad}px`;
    c.style.width = `calc(100% + ${pad * 2}px)`;
    c.style.height = `calc(100% + ${pad * 2}px)`;
    el.prepend(c);
    const render = () => {
      if (!el.isConnected) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const d = dprOf();
      c.width = Math.round((w + pad * 2) * d);
      c.height = Math.round((h + pad * 2) * d);
      const x = c.getContext("2d");
      x.setTransform(d, 0, 0, d, pad * d, pad * d);
      x.clearRect(-pad, -pad, w + pad * 2, h + pad * 2);
      draw(x, w, h, el);
    };
    renders.push(render);
    return render;
  }

  const poly = (x, pts) => {
    x.beginPath();
    pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.closePath();
  };

  function frame(x, pts, { fill, tint, stroke, glow, lw = 1.5 }) {
    poly(x, pts);
    x.fillStyle = fill;
    x.fill();
    if (tint) {
      x.fillStyle = tint;
      x.fill();
    }
    x.save();
    if (glow) {
      x.shadowColor = glow;
      x.shadowBlur = 12;
    }
    poly(x, pts);
    x.strokeStyle = stroke;
    x.lineWidth = lw;
    x.stroke();
    x.restore();
  }

  const hGrad = (x, w, stops) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  };
  const vGrad = (x, h, a, b) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    return g;
  };

  function text(x, el, str, color, cx, cy, align = "center", base = "middle") {
    const cs = getComputedStyle(el);
    x.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ("letterSpacing" in x) x.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    x.fillStyle = color;
    x.textAlign = align;
    x.textBaseline = base;
    x.fillText(str, cx, cy);
  }

  function stripes(x, cx, y, width, color) {
    x.fillStyle = color;
    for (let sx = cx - width / 2; sx < cx + width / 2 - 5; sx += 9) {
      poly(x, [[sx + 2, y], [sx + 7, y], [sx + 5, y + 3], [sx, y + 3]]);
      x.fill();
    }
  }

  // ---- 주 버튼 (대결 시작 / 다시 대결 / 여기서 플레이) ----
  function drawPrimary(x, w, h, el, { nodes = false } = {}) {
    const i = 0.75;
    frame(x, [[i, 10], [10, i], [w - 10, i], [w - i, 10], [w - i, h - i], [i, h - i]], {
      fill: vGrad(x, h, "#121a3a", "#0a1226"),
      stroke: hGrad(x, w, [[0, AQUA], [0.55, "#7f8cff"], [1, VIOLET]]),
      glow: "rgba(127, 140, 255, 0.45)",
    });
    stripes(x, w / 2, h - 10, Math.min(w * 0.36, 140), "rgba(167, 123, 255, 0.9)");
    if (nodes) {
      x.save();
      x.strokeStyle = "#7f8cff";
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(-16, h / 2);
      x.lineTo(6, h / 2);
      x.moveTo(w - 6, h / 2);
      x.lineTo(w + 16, h / 2);
      x.stroke();
      x.shadowColor = VIOLET;
      x.shadowBlur = 8;
      x.fillStyle = "#b9a8ff";
      [-17, w + 17].forEach((cx) => {
        x.beginPath();
        x.arc(cx, h / 2, 3.5, 0, Math.PI * 2);
        x.fill();
      });
      x.restore();
    }
    const label = el.querySelector(".lbl") || el;
    text(x, label, el.dataset.label || label.textContent.trim(), AQUA, w / 2, h / 2 - (h > 50 ? 1 : 0));
  }

  // ---- 보조 버튼 (QR 공유 / 처음으로 / 인쇄) ----
  function drawGhost(x, w, h) {
    const i = 0.75;
    frame(x, [[i, i], [w - i, i], [w - i, h - 12], [w - 10, h - i], [i, h - i]], {
      fill: "#070c1c",
      stroke: hGrad(x, w, [[0, "rgba(88, 213, 242, 0.45)"], [1, "rgba(167, 123, 255, 0.45)"]]),
    });
    x.fillStyle = "rgba(167, 123, 255, 0.7)";
    x.fillRect(14, h - 7, 28, 2);
  }

  // ---- 큰 패널 (결과 / QR) ----
  function drawPanel(x, w, h) {
    const i = 0.75;
    const c = 18;
    frame(x, [[i, c], [c, i], [w - i, i], [w - i, h - c], [w - c, h - i], [i, h - i]], {
      fill: "rgba(8, 12, 30, 0.92)",
      stroke: hGrad(x, w, [[0, "rgba(88, 213, 242, 0.5)"], [1, "rgba(167, 123, 255, 0.5)"]]),
    });
    // 모서리 강조선
    x.save();
    x.lineCap = "round";
    x.shadowBlur = 8;
    x.lineWidth = 2.5;
    x.shadowColor = AQUA;
    x.strokeStyle = AQUA;
    x.beginPath();
    x.moveTo(i, c + 26);
    x.lineTo(i, c);
    x.lineTo(c, i);
    x.lineTo(c + 40, i);
    x.stroke();
    x.shadowColor = VIOLET;
    x.strokeStyle = VIOLET;
    x.beginPath();
    x.moveTo(w - i, h - c - 26);
    x.lineTo(w - i, h - c);
    x.lineTo(w - c, h - i);
    x.lineTo(w - c - 40, h - i);
    x.stroke();
    x.restore();
    stripes(x, w - 46, 8, 48, "rgba(167, 123, 255, 0.75)");
  }

  // ---- 결과 카드 ----
  function drawCard(x, w, h, el) {
    const p2 = el.classList.contains("p2");
    const pc = p2 ? PINK : AQUA;
    const soft = p2 ? "rgba(255, 143, 183, 0.55)" : "rgba(88, 213, 242, 0.55)";
    const win = el.classList.contains("win");
    const i = 0.75;
    frame(x, [[i, i], [w - 12, i], [w - i, 12], [w - i, h - i], [8, h - i], [i, h - 8]], {
      fill: "#0a0f22",
      tint: p2 ? "rgba(255, 143, 183, 0.07)" : "rgba(88, 213, 242, 0.07)",
      stroke: hGrad(x, w, [[0, win ? pc : soft], [1, win ? VIOLET : "rgba(167, 123, 255, 0.4)"]]),
      glow: win ? pc : null,
      lw: win ? 2 : 1.5,
    });
    if (win) {
      x.fillStyle = pc;
      x.fillRect(12, h - 5, 30, 2);
    }
  }

  // ---- 이름 입력칸 ----
  function drawInput(x, w, h, el) {
    const p2 = el.classList.contains("p2");
    const pc = p2 ? PINK : AQUA;
    const pcSoft = p2 ? "rgba(255, 143, 183, 0.7)" : "rgba(88, 213, 242, 0.7)";
    const i = 0.75;
    const focused = document.activeElement?.tagName === "INPUT" && el.contains(document.activeElement);
    frame(x, [[i, i], [w - 46, i], [w - 40, 6], [w - i, 6], [w - i, h - i], [10, h - i], [i, h - 10]], {
      fill: vGrad(x, h, "#0c1230", "#080c1c"),
      stroke: hGrad(x, w, [[0, focused ? pc : pcSoft], [1, focused ? "#8c5aff" : "rgba(140, 90, 255, 0.55)"]]),
      glow: focused ? "rgba(140, 110, 255, 0.6)" : null,
    });
    const tag = el.querySelector(".tag");
    if (tag) text(x, tag, tag.textContent, pc, w - 14, 12, "right", "top");
  }

  // ---- 라운드 선택 ----
  function drawRound(x, w, h, el) {
    const on = el.previousElementSibling?.checked;
    const i = 0.75;
    frame(x, [[i, i], [w - i, i], [w - i, h - 8], [w - 8, h - i], [i, h - i]], {
      fill: on ? "#141a40" : "#0a1024",
      stroke: on ? "#8f8cff" : "rgba(127, 140, 255, 0.45)",
      glow: on ? "rgba(143, 140, 255, 0.5)" : null,
    });
  }

  // ---- 플레이어 색 점 ----
  function drawDot(x, w, h, el) {
    x.fillStyle = el.closest(".field-p2") ? PINK : AQUA;
    x.beginPath();
    x.arc(4.8, h / 2, 4.8, 0, Math.PI * 2);
    x.fill();
  }

  // ---- 민트색 강조 글자 (안내 문구의 "초록색", 결과표의 이긴 기록) ----
  const MINT = COL.go ?? "#4cf0c4";
  function drawWord(x, w, h, el) {
    const cs = getComputedStyle(el);
    x.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ("letterSpacing" in x) x.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    const str = el.textContent.trim();
    const m = x.measureText(str);
    const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
    const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
    x.fillStyle = MINT;
    x.textAlign = "center";
    x.textBaseline = "alphabetic";
    x.fillText(str, w / 2, (h - (asc + desc)) / 2 + asc);
  }

  // 어떤 요소를 어떤 모양으로 그릴지
  const rules = [
    [".btn-start", 26, (x, w, h, el) => drawPrimary(x, w, h, el, { nodes: true })],
    ["#result .btn-primary, #qr .btn-primary", 14, drawPrimary],
    [".btn-qr, #result .btn-ghost, #qr .btn-ghost", 4, drawGhost],
    [".panel", 14, drawPanel],
    [".card", 14, drawCard],
    [".inp", 12, drawInput],
    [".rounds label i", 2, drawRound],
    [".field > span", 2, drawDot],
    [".go-text, .round-table td.best", 2, drawWord],
  ];

  function scan() {
    rules.forEach(([sel, pad, draw]) => document.querySelectorAll(sel).forEach((el) => mount(el, pad, draw)));
  }

  function renderAll() {
    scan();
    for (let k = renders.length - 1; k >= 0; k--) renders[k]();
  }

  // QR 포스터에서 같은 패널 모양을 쓰기 위해 공개
  window.RD_FX = { drawPanel, stripes };

  scan();
  document.documentElement.classList.add("has-fx");
  renderAll();
  document.fonts?.ready.then(renderAll);
  addEventListener("resize", renderAll);

  // 입력칸 포커스, 라운드 변경, 화면 전환, 결과 카드 생성 시 다시 그림
  document.addEventListener("focusin", renderAll);
  document.addEventListener("focusout", () => requestAnimationFrame(renderAll));
  document.addEventListener("change", renderAll);
  const mo = new MutationObserver(() => requestAnimationFrame(renderAll));
  document.querySelectorAll(".screen").forEach((s) => mo.observe(s, { attributes: true, attributeFilter: ["class"] }));
  const cards = document.getElementById("result-cards");
  if (cards) mo.observe(cards, { childList: true });
})();
