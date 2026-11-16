// 버튼·입력칸·라운드 선택의 프레임을 canvas로 그림.
// 삼성 인터넷 다크모드는 CSS 색(테두리·배경·글자)을 임의로 어둡게 바꾸지만 canvas 내용은 그대로 두기 때문.
// 이 스크립트가 동작하면 <html>에 has-fx 클래스가 붙고, CSS 쪽 프레임은 숨겨짐.
(() => {
  const AQUA = "#58d5f2";
  const PINK = "#ff8fb7";
  const VIOLET = "#a77bff";
  const items = [];

  const dprOf = () => Math.min(window.devicePixelRatio || 1, 3);

  function mount(el, pad, draw) {
    const c = document.createElement("canvas");
    c.className = "fx";
    c.setAttribute("aria-hidden", "true");
    c.style.left = c.style.top = `${-pad}px`;
    c.style.width = `calc(100% + ${pad * 2}px)`;
    c.style.height = `calc(100% + ${pad * 2}px)`;
    el.prepend(c);
    const render = () => {
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
    items.push(render);
    return render;
  }

  const poly = (x, pts) => {
    x.beginPath();
    pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.closePath();
  };

  function frame(x, pts, { fill, stroke, glow }) {
    poly(x, pts);
    x.fillStyle = fill;
    x.fill();
    x.save();
    if (glow) {
      x.shadowColor = glow;
      x.shadowBlur = 10;
    }
    poly(x, pts);
    x.strokeStyle = stroke;
    x.lineWidth = 1.5;
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

  // ---- 대결 시작 ----
  const start = document.querySelector(".btn-start");
  if (start) {
    mount(start, 26, (x, w, h, el) => {
      const i = 0.75;
      frame(x, [[i, 10], [10, i], [w - 10, i], [w - i, 10], [w - i, h - i], [i, h - i]], {
        fill: vGrad(x, h, "#121a3a", "#0a1226"),
        stroke: hGrad(x, w, [[0, AQUA], [0.55, "#7f8cff"], [1, VIOLET]]),
        glow: "rgba(127, 140, 255, 0.45)",
      });
      // 아래 보라 사선 줄무늬
      const bw = w * 0.36;
      x.fillStyle = "rgba(167, 123, 255, 0.9)";
      for (let sx = w / 2 - bw / 2; sx < w / 2 + bw / 2 - 5; sx += 9) {
        poly(x, [[sx + 2, h - 10], [sx + 7, h - 10], [sx + 5, h - 7], [sx, h - 7]]);
        x.fill();
      }
      // 양옆 회로 노드
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
      text(x, el.querySelector(".lbl"), "대결 시작", AQUA, w / 2, h / 2);
    });
  }

  // ---- QR 공유 ----
  const qr = document.querySelector(".btn-qr");
  if (qr) {
    mount(qr, 4, (x, w, h) => {
      const i = 0.75;
      frame(x, [[i, i], [w - i, i], [w - i, h - 12], [w - 10, h - i], [i, h - i]], {
        fill: "#070c1c",
        stroke: hGrad(x, w, [[0, "rgba(88, 213, 242, 0.45)"], [1, "rgba(167, 123, 255, 0.45)"]]),
      });
      x.fillStyle = "rgba(167, 123, 255, 0.7)";
      x.fillRect(14, h - 7, 28, 2);
    });
  }

  // ---- 이름 입력칸 ----
  document.querySelectorAll(".inp").forEach((wrap) => {
    const p2 = wrap.classList.contains("p2");
    const pc = p2 ? PINK : AQUA;
    const pcSoft = p2 ? "rgba(255, 143, 183, 0.7)" : "rgba(88, 213, 242, 0.7)";
    const tag = wrap.querySelector(".tag");
    const render = mount(wrap, 12, (x, w, h, el) => {
      const i = 0.75;
      const focused = el.contains(document.activeElement) && document.activeElement.tagName === "INPUT";
      frame(x, [[i, i], [w - 46, i], [w - 40, 6], [w - i, 6], [w - i, h - i], [10, h - i], [i, h - 10]], {
        fill: vGrad(x, h, "#0c1230", "#080c1c"),
        stroke: hGrad(x, w, [[0, focused ? pc : pcSoft], [1, focused ? "#8c5aff" : "rgba(140, 90, 255, 0.55)"]]),
        glow: focused ? "rgba(140, 110, 255, 0.6)" : null,
      });
      if (tag) text(x, tag, tag.textContent, pc, w - 14, 12, "right", "top");
    });
    const input = wrap.querySelector("input");
    input.addEventListener("focus", render);
    input.addEventListener("blur", render);
  });

  // ---- 라운드 선택 ----
  const roundBoxes = [...document.querySelectorAll(".rounds label i")];
  const renderRounds = roundBoxes.map((box) =>
    mount(box, 2, (x, w, h, el) => {
      const on = el.previousElementSibling?.checked;
      const i = 0.75;
      frame(x, [[i, i], [w - i, i], [w - i, h - 8], [w - 8, h - i], [i, h - i]], {
        fill: on ? "#141a40" : "#0a1024",
        stroke: on ? "#8f8cff" : "rgba(127, 140, 255, 0.45)",
        glow: on ? "rgba(143, 140, 255, 0.5)" : null,
      });
    })
  );
  document.querySelectorAll(".rounds input").forEach((r) => r.addEventListener("change", () => renderRounds.forEach((f) => f())));

  // ---- 플레이어 색 점 ----
  document.querySelectorAll(".field > span").forEach((span) => {
    const pc = span.closest(".field-p2") ? PINK : AQUA;
    mount(span, 2, (x, w, h) => {
      x.fillStyle = pc;
      x.beginPath();
      x.arc(4.8, h / 2, 4.8, 0, Math.PI * 2);
      x.fill();
    });
  });

  document.documentElement.classList.add("has-fx");

  const renderAll = () => items.forEach((f) => f());
  renderAll();
  document.fonts?.ready.then(renderAll);
  addEventListener("resize", renderAll);
  // 화면 전환 시(숨겨져 있던 요소가 보일 때) 다시 그림
  const mo = new MutationObserver(() => requestAnimationFrame(renderAll));
  document.querySelectorAll(".screen").forEach((s) => mo.observe(s, { attributes: true, attributeFilter: ["class"] }));
})();
