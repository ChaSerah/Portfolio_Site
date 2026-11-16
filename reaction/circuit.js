// 회로 배경 + 회로를 따라 흐르는 빛 (canvas)
// 레퍼런스(720×1280) 배치를 그대로 옮기고 색만 파랑·보라 계열로 바꿈.
// - 좌표는 레퍼런스 픽셀 기준으로 적고 0.5배(360×640 설계 공간)로 사용
// - 위 묶음은 화면 위쪽, 아래 묶음은 화면 아래쪽에 붙임
// - 정적인 회로는 한 번만 그리고, 매 프레임 빛 펄스만 그림
// - 게임 화면·탭 숨김·움직임 줄이기 설정에서는 애니메이션을 멈춤
(() => {
  const W = 360;
  const H = 640;
  const SPLIT = 450; // 이 y(설계 좌표)보다 위는 위 묶음
  const P = (s) => s.trim().split(/\s+/).map((p) => p.split(",").map((n) => Number(n) / 2));

  // [굵기(1~3), 경로]
  const traces = [
    // ---- 위 왼쪽 묶음 ----
    [1, "278,-5 278,226"],
    [2, "288,-5 288,72 300,84 300,196 290,206 290,300 312,322 366,322"],
    [1, "312,-5 312,62 328,78 328,180 312,196 312,250 330,268 386,268"],
    [1, "342,22 342,130 358,150 358,160"],
    [1, "356,-5 356,100 380,124 380,140"],
    [1, "375,-5 375,52"],
    [1, "418,15 404,30 404,120"],
    [1, "316,232 330,246 384,246"],
    [2, "466,-5 466,80 440,106 440,190 404,226 404,444 376,472 376,578 398,600 398,622 416,640"],
    // ---- 위 가운데 묶음 ----
    [1, "486,-5 486,112 470,128 470,296 452,314 452,372 432,392"],
    [1, "500,-5 500,150 486,166 486,330 474,342 474,444"],
    [1, "512,-5 512,200 494,218 494,420"],
    [1, "524,-5 524,180 540,196 540,272 520,292 520,356"],
    [1, "540,-5 540,150 556,166 556,252 534,274 534,384"],
    [1, "470,150 458,162 458,352"],
    [1, "445,360 445,430 437,440"],
    // ---- 위 오른쪽 굵은 다발 ----
    [3, "580,-5 580,30 590,40 590,200 606,216 606,330 640,364 640,520 656,536 656,664"],
    [3, "594,-5 594,190 620,216 620,360 650,390 650,520 668,538 668,600 692,622"],
    [2, "566,-5 566,190 584,208 584,340 612,368 612,500 628,516 628,610 640,622 640,704"],
    [1, "574,250 574,380 598,404 598,460"],
    [1, "625,600 625,684"],
    [1, "646,330 646,420 668,442"],
    [1, "650,-5 650,124"],
    [2, "700,-5 700,92 676,116 676,206 690,220 725,220"],
    [1, "725,100 704,120 704,158"],
    // ---- 가운데 짧은 조각 ----
    [1, "230,738 300,738 322,718 350,702"],
    // ---- 아래 왼쪽 묶음 ----
    [2, "-5,1025 152,1025 168,1041 168,1096"],
    [1, "-5,1050 30,1050 50,1070 50,1126"],
    [1, "84,1040 120,1040 132,1052 132,1108 122,1118"],
    [1, "104,1062 104,1094 92,1106 92,1118"],
    [1, "70,1064 70,1108"],
    [2, "-5,1135 270,1135 300,1104 392,1104 418,1124 446,1144"],
    [1, "-5,1160 150,1160 166,1150 228,1150"],
    [1, "-5,1180 110,1180 128,1170 250,1170 270,1160"],
    [1, "-5,1198 150,1198 166,1192 180,1192"],
    [1, "-5,1212 200,1212 216,1206 256,1206"],
    [1, "40,1225 120,1225 132,1235"],
    [1, "-5,1240 70,1240 90,1252 190,1252 202,1240"],
    [1, "150,1262 226,1262"],
    [1, "240,1192 280,1190"],
  ].map(([w, s]) => ({ w, pts: P(s) }));

  // 끝점 [종류, x, y, 반지름] — rw: 흰 링, dw: 흰 점, rc: 색 링, dc: 색 점 (레퍼런스 픽셀 좌표)
  const marks = [
    ["rw", 375, 322, 9], ["rw", 394, 268, 6], ["rw", 327, 212, 5], ["dc", 278, 228, 4], ["dc", 358, 163, 4],
    ["dc", 380, 145, 4], ["rc", 342, 15, 5], ["rc", 392, 12, 5], ["dc", 375, 55, 4], ["dc", 404, 124, 4],
    ["dc", 388, 246, 4], ["dc", 398, 232, 4], ["rw", 422, 648, 10], ["rw", 428, 396, 7], ["rw", 472, 452, 6],
    ["dw", 492, 427, 5], ["rc", 520, 362, 5], ["dw", 535, 390, 5], ["dc", 458, 358, 4], ["dc", 474, 338, 4],
    ["rw", 436, 447, 6], ["dw", 656, 670, 5], ["dw", 698, 626, 5], ["rw", 640, 716, 12], ["dw", 598, 465, 5],
    ["rc", 625, 690, 6], ["rw", 670, 447, 5], ["dw", 650, 130, 5], ["dc", 704, 162, 4], ["dc", 717, 150, 3],
    ["rc", 358, 698, 8], ["dc", 258, 726, 4],
    ["rw", 168, 1103, 8], ["dw", 50, 1130, 4], ["rc", 72, 1057, 5], ["rc", 105, 1047, 5], ["dc", 73, 1112, 4],
    ["dc", 104, 1075, 4], ["dc", 121, 1120, 4], ["dc", 92, 1122, 4], ["rw", 454, 1145, 10], ["rw", 235, 1150, 7],
    ["rw", 279, 1158, 6], ["dc", 232, 1173, 4], ["dw", 184, 1193, 4], ["dc", 262, 1208, 5], ["rw", 135, 1237, 5],
    ["rw", 205, 1236, 5], ["dw", 230, 1262, 5], ["rw", 285, 1190, 5], ["rw", 32, 1122, 5],
  ].map(([t, x, y, r]) => ({ t, x: x / 2, y: y / 2, r: r / 2 }));

  // ---- 경로 길이 계산 (빛 이동용) ----
  const measure = (pts) => {
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const l = Math.hypot(x1 - x0, y1 - y0);
      seg.push({ x0, y0, x1, y1, l, s: total });
      total += l;
    }
    return { pts, seg, total };
  };
  const pointAt = (m, d) => {
    d = Math.max(0, Math.min(m.total, d));
    for (const s of m.seg) {
      if (d <= s.s + s.l) {
        const k = (d - s.s) / s.l;
        return [s.x0 + (s.x1 - s.x0) * k, s.y0 + (s.y1 - s.y0) * k];
      }
    }
    const last = m.seg[m.seg.length - 1];
    return [last.x1, last.y1];
  };
  const isBottom = (y) => y > SPLIT;
  const routes = traces.filter((t) => t.pts.length > 1).map((t) => Object.assign(measure(t.pts), { w: t.w, bottom: isBottom(t.pts[0][1]) }));

  // ---- 캔버스 ----
  const canvas = document.createElement("canvas");
  canvas.className = "circuit-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");
  const layer = document.createElement("canvas");
  const lctx = layer.getContext("2d");
  let scale = 1;
  let oy = 0;
  let dpr = 1;

  const line = (c, pts) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  };

  const WIDTH = { 1: [1.5, 0.45], 2: [2.5, 0.7], 3: [3.8, 1.1] }; // [빛 번짐 선, 밝은 심지]

  function paint(c, bottom) {
    c.lineCap = "round";
    c.lineJoin = "round";
    const list = traces.filter((t) => isBottom(t.pts[0][1]) === bottom);
    const grad = c.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#3f5bff");
    grad.addColorStop(0.55, "#5546ff");
    grad.addColorStop(1, "#8b45ff");

    // 1) 네온 바깥 빛 + 선
    c.shadowColor = "rgba(70, 80, 255, 0.95)";
    c.shadowBlur = 7;
    c.strokeStyle = grad;
    list.forEach((t) => {
      c.lineWidth = WIDTH[t.w][0];
      line(c, t.pts);
    });
    // 2) 밝은 심지 (광섬유 느낌)
    c.shadowBlur = 0;
    c.strokeStyle = "rgba(190, 196, 255, 0.55)";
    list.forEach((t) => {
      c.lineWidth = WIDTH[t.w][1];
      line(c, t.pts);
    });

    // 3) 큰 링 주변 은은한 빛 상자 (레퍼런스의 붉은 네모 자리)
    if (!bottom) {
      const g = c.createRadialGradient(320, 358, 0, 320, 358, 28);
      g.addColorStop(0, "rgba(140, 110, 255, 0.35)");
      g.addColorStop(1, "rgba(140, 110, 255, 0)");
      c.fillStyle = g;
      c.fillRect(292, 330, 56, 56);
    }

    // 4) 끝점
    marks
      .filter((m) => isBottom(m.y) === bottom)
      .forEach((m) => {
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        if (m.t === "rw" || m.t === "dw") {
          c.shadowColor = "rgba(190, 200, 255, 1)";
          c.shadowBlur = 8;
        } else {
          c.shadowColor = "rgba(110, 100, 255, 0.9)";
          c.shadowBlur = 6;
        }
        if (m.t === "rw") {
          c.strokeStyle = "#f3f5ff";
          c.lineWidth = Math.max(1.4, m.r * 0.45);
          c.stroke();
        } else if (m.t === "rc") {
          c.strokeStyle = "#7a6bff";
          c.lineWidth = 1.2;
          c.stroke();
        } else {
          c.fillStyle = m.t === "dw" ? "#f3f5ff" : "#6a5cff";
          c.fill();
        }
      });
    c.shadowBlur = 0;
  }

  function drawStatic() {
    const cw = innerWidth;
    const ch = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = layer.width = Math.round(cw * dpr);
    canvas.height = layer.height = Math.round(ch * dpr);
    scale = cw / W;
    oy = ch - H * scale;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
    for (const bottom of [false, true]) {
      lctx.save();
      lctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, bottom ? dpr * oy : 0);
      paint(lctx, bottom);
      lctx.restore();
    }
  }

  // ---- 빛 펄스 (광섬유를 따라 흐르는 빛) ----
  const pulses = [];
  const flashes = [];
  let lastSpawn = 0;
  function spawn(now) {
    const route = routes[(Math.random() * routes.length) | 0];
    pulses.push({
      route,
      d: 0,
      speed: 55 + Math.random() * 35,
      trail: 30 + Math.random() * 16,
      hue: Math.random() < 0.5 ? "190, 210, 255" : "215, 185, 255",
    });
    lastSpawn = now;
  }

  function glowDot(x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
    g.addColorStop(0.25, `rgba(${rgb}, ${a * 0.9})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  let prev = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const gameOn = document.getElementById("game")?.classList.contains("is-active");
    canvas.style.visibility = gameOn ? "hidden" : "visible";
    if (gameOn || document.hidden) {
      prev = now;
      return;
    }
    const dt = Math.min(0.05, (now - prev) / 1000 || 0);
    prev = now;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer, 0, 0);
    const setT = (bottom) => ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, bottom ? dpr * oy : 0);
    ctx.globalCompositeOperation = "lighter";

    if (pulses.length < 4 && now - lastSpawn > 700 + Math.random() * 900) spawn(now);

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      setT(p.route.bottom);
      p.d += p.speed * dt;
      const steps = 10;
      for (let k = steps; k >= 0; k--) {
        const dd = p.d - (p.trail * k) / steps;
        if (dd < 0 || dd > p.route.total) continue;
        const [x, y] = pointAt(p.route, dd);
        glowDot(x, y, 2.6 + (1 - k / steps) * 3.2, p.hue, (1 - k / steps) * 0.8);
      }
      if (p.d <= p.route.total) {
        const [x, y] = pointAt(p.route, p.d);
        glowDot(x, y, 9, p.hue, 0.9);
        glowDot(x, y, 3.5, "255, 255, 255", 1);
      }
      if (p.d - p.trail > p.route.total) {
        const [x, y] = p.route.pts[p.route.pts.length - 1];
        flashes.push({ x, y, t: 0, hue: p.hue, bottom: p.route.bottom });
        pulses.splice(i, 1);
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      setT(f.bottom);
      f.t += dt;
      const a = Math.max(0, 1 - f.t / 0.5);
      glowDot(f.x, f.y, 6 + f.t * 22, f.hue, a);
      if (f.t > 0.5) flashes.splice(i, 1);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  drawStatic();
  addEventListener("resize", drawStatic);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    ctx.drawImage(layer, 0, 0);
  } else {
    requestAnimationFrame(frame);
  }
})();
