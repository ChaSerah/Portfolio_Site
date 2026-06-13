const canvas = document.querySelector(".stars");
const ctx = canvas?.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let sideStars = [];
let featureStars = [];
let meteors = [];
let nextMeteor = 0;
let animationFrame = 0;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function easeInOut(value) {
  return value * value * (3 - 2 * value);
}

function makeSideX(zone, margin = 10) {
  const leftMax = Math.min(window.innerWidth * 0.28, 420);
  const rightMin = window.innerWidth - leftMax;
  return zone === "left"
    ? randomBetween(margin, Math.max(margin + 1, leftMax - margin))
    : randomBetween(Math.min(window.innerWidth - margin - 1, rightMin + margin), window.innerWidth - margin);
}

const featureStarPalettes = [
  {
    hue: "255, 218, 142",
    ray: "255, 230, 170",
    core: "255, 248, 222",
  },
  {
    hue: "255, 232, 184",
    ray: "255, 240, 208",
    core: "255, 253, 238",
  },
  {
    hue: "255, 246, 218",
    ray: "255, 250, 232",
    core: "255, 255, 248",
  },
];

const featureStarScales = [1.5, 2.5, 3.5];

function makeFeatureStarX(zone, margin = 10, avoidRails = true) {
  const leftMax = Math.min(window.innerWidth * 0.28, 420);
  const railClearance = Math.min(Math.max(window.innerWidth * 0.11, 120), 190);
  const rightMin = window.innerWidth - leftMax;

  if (!avoidRails) {
    return makeSideX(zone, margin);
  }

  return zone === "left"
    ? randomBetween(Math.min(leftMax - margin, railClearance + margin), Math.max(railClearance + margin + 1, leftMax - margin))
    : randomBetween(Math.min(window.innerWidth - railClearance - margin - 1, rightMin + margin), window.innerWidth - railClearance - margin);
}

function wrapY(value, span) {
  return ((value % span) + span) % span;
}

function makeDust(length, count) {
  return Array.from({ length: count }, () => ({
    distance: randomBetween(-length * 0.86, length * 0.86),
    jitter: randomBetween(-1.15, 1.15),
    radius: randomBetween(0.22, 0.72),
    alpha: randomBetween(0.18, 0.68),
  }));
}

function makeMeteor(time) {
  const leftSide = Math.random() > 0.5;
  const sideWidth = Math.min(window.innerWidth * 0.3, 430);
  const startX = leftSide ? randomBetween(18, sideWidth * 0.88) : randomBetween(window.innerWidth - sideWidth * 0.88, window.innerWidth - 18);
  const startY = randomBetween(-40, window.innerHeight * 0.58);
  const angle = leftSide ? randomBetween(0.55, 0.78) : randomBetween(2.36, 2.59);
  const distance = randomBetween(150, 260);
  const duration = randomBetween(820, 1350);

  return {
    startX,
    startY,
    endX: startX + Math.cos(angle) * distance,
    endY: startY + Math.sin(angle) * distance,
    length: randomBetween(42, 76),
    width: randomBetween(0.65, 1.05),
    alpha: randomBetween(0.36, 0.62),
    startedAt: time,
    duration,
    hue: Math.random() > 0.62 ? "255, 249, 218" : "218, 245, 255",
  };
}

function resizeCanvas() {
  if (!canvas || !ctx) return;

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const sideArea = window.innerWidth * window.innerHeight * 0.42;
  const smallCount = Math.max(102, Math.floor(sideArea / 3830));
  const scrollSpan = Math.max(document.documentElement.scrollHeight, window.innerHeight * 2);
  const zones = ["left", "right"];

  sideStars = Array.from({ length: smallCount }, (_, index) => {
    const zone = zones[index % 2];
    return {
      x: makeSideX(zone),
      y: Math.random() * scrollSpan,
      r: randomBetween(0.35, 1.35),
      alpha: randomBetween(0.22, 0.76),
      speed: randomBetween(0.15, 0.44),
      phase: randomBetween(0, Math.PI * 2),
      twinkle: randomBetween(0.0018, 0.0045),
      hue: Math.random() > 0.72 ? "255, 250, 214" : "218, 244, 255",
    };
  });

  const featureStarCount = window.innerWidth < 720 ? 3 : 4;
  featureStars = Array.from({ length: featureStarCount }, (_, index) => {
    const zone = zones[index % 2];
    const scale = featureStarScales[index % featureStarScales.length];
    const baseRay = window.innerWidth < 720 ? randomBetween(18, 24) : randomBetween(20, 27);
    const rayLong = baseRay * scale;
    const safeMargin = rayLong + 18;
    const palette = featureStarPalettes[index % featureStarPalettes.length];
    const x = makeFeatureStarX(zone, safeMargin, true);
    const y = randomBetween(safeMargin, window.innerHeight - safeMargin);
    return {
      x,
      y,
      r: randomBetween(0.45, 0.72) * Math.sqrt(scale),
      spike: randomBetween(5.8, 8.2) * scale,
      rayLong,
      scale,
      alpha: randomBetween(0.86, 1.16),
      speed: randomBetween(0.2, 0.5),
      phase: randomBetween(0, Math.PI * 2),
      blinkStart: index < 2 ? randomBetween(-1400, -120) : -9999,
      blinkDuration: randomBetween(1900, 2900),
      nextBlink: randomBetween(1800 + index * 900, 5200 + index * 1200),
      tilt: randomBetween(0.18, 0.34) * (zone === "left" ? 1 : -1),
      zone,
      dustHorizontal: makeDust(rayLong * 0.72, 12),
      dustVertical: makeDust(rayLong * 0.66, 10),
      palette,
      hue: palette.hue,
    };
  });
}

function drawRay(length, alpha, width = 0.65, palette = featureStarPalettes[1]) {
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(-length, 0, length, 0);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.42, `rgba(${palette.ray}, ${alpha * 0.18})`);
  gradient.addColorStop(0.5, `rgba(${palette.core}, ${alpha})`);
  gradient.addColorStop(0.58, `rgba(${palette.ray}, ${alpha * 0.18})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-length, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
}

function drawCoreRay(length, alpha, width = 2.2, palette = featureStarPalettes[1]) {
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(-length, 0, length, 0);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.3, `rgba(${palette.hue}, ${alpha * 0.08})`);
  gradient.addColorStop(0.46, `rgba(${palette.ray}, ${alpha * 0.7})`);
  gradient.addColorStop(0.5, `rgba(${palette.core}, ${alpha})`);
  gradient.addColorStop(0.54, `rgba(${palette.ray}, ${alpha * 0.7})`);
  gradient.addColorStop(0.7, `rgba(${palette.hue}, ${alpha * 0.08})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-length, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
}

function drawSparkDust(dust, alpha) {
  if (!ctx) return;

  for (const spark of dust) {
    ctx.fillStyle = `rgba(244, 252, 255, ${alpha * spark.alpha})`;
    ctx.beginPath();
    ctx.arc(spark.distance, spark.jitter, spark.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFeatureStar(star, x, y, alpha) {
  if (!ctx) return;

  const glow = ctx.createRadialGradient(x, y, 0, x, y, star.rayLong * 0.42);
  glow.addColorStop(0, `rgba(${star.hue}, ${alpha * 0.38})`);
  glow.addColorStop(0.18, `rgba(${star.hue}, ${alpha * 0.12})`);
  glow.addColorStop(1, `rgba(${star.hue}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, star.spike * 0.62, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(star.tilt);
  ctx.shadowColor = `rgba(${star.hue}, ${alpha})`;
  ctx.shadowBlur = 10;

  drawRay(star.rayLong, alpha * 0.72, 0.58, star.palette);
  drawSparkDust(star.dustHorizontal, alpha * 0.32);
  ctx.rotate(Math.PI / 2);
  drawRay(star.rayLong * 0.9, alpha * 0.68, 0.58, star.palette);
  drawSparkDust(star.dustVertical, alpha * 0.28);

  ctx.rotate(-Math.PI / 2);
  for (const angle of [Math.PI / 4, -Math.PI / 4, Math.PI / 7, -Math.PI / 7]) {
    ctx.save();
    ctx.rotate(angle);
    drawRay(star.rayLong * (Math.abs(angle) > 0.65 ? 0.52 : 0.38), alpha * 0.26, 0.34, star.palette);
    ctx.restore();
  }

  ctx.rotate(Math.PI / 4);
  drawRay(star.rayLong * 0.24, alpha * 0.22, 0.28, star.palette);
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(star.tilt);
  ctx.shadowColor = `rgba(${star.hue}, ${alpha})`;
  ctx.shadowBlur = 14;
  drawCoreRay(star.rayLong * 0.23, alpha * 1.12, 2.55, star.palette);
  ctx.rotate(Math.PI / 2);
  drawCoreRay(star.rayLong * 0.2, alpha * 1.08, 2.55, star.palette);
  ctx.restore();

  const coreRadius = Math.min(star.rayLong * 0.13, star.spike * 0.46);
  const core = ctx.createRadialGradient(x, y, 0, x, y, coreRadius);
  core.addColorStop(0, `rgba(${star.palette.core}, ${alpha * 0.88})`);
  core.addColorStop(0.38, `rgba(${star.hue}, ${alpha * 0.24})`);
  core.addColorStop(1, `rgba(${star.hue}, 0)`);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(${star.palette.core}, ${alpha * 0.74})`;
  ctx.beginPath();
  ctx.arc(x, y, star.r * 0.75, 0, Math.PI * 2);
  ctx.fill();
}

function drawMeteor(meteor, time) {
  if (!ctx) return false;

  const progress = clamp((time - meteor.startedAt) / meteor.duration, 0, 1);
  if (progress >= 1) return false;

  const eased = easeInOut(progress);
  const x = meteor.startX + (meteor.endX - meteor.startX) * eased;
  const y = meteor.startY + (meteor.endY - meteor.startY) * eased;
  const dx = meteor.endX - meteor.startX;
  const dy = meteor.endY - meteor.startY;
  const angle = Math.atan2(dy, dx);
  const fade = Math.sin(Math.PI * progress);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = `rgba(${meteor.hue}, ${meteor.alpha * fade})`;
  ctx.shadowBlur = 8;

  const tail = ctx.createLinearGradient(-meteor.length, 0, 8, 0);
  tail.addColorStop(0, `rgba(${meteor.hue}, 0)`);
  tail.addColorStop(0.72, `rgba(${meteor.hue}, ${meteor.alpha * fade * 0.42})`);
  tail.addColorStop(1, `rgba(255, 255, 255, ${meteor.alpha * fade})`);
  ctx.strokeStyle = tail;
  ctx.lineWidth = meteor.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-meteor.length, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();

  ctx.fillStyle = `rgba(255, 255, 255, ${meteor.alpha * fade * 0.72})`;
  ctx.beginPath();
  ctx.arc(8, 0, meteor.width * 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return true;
}

function updateFeatureStar(star, time, span, scrollY) {
  const margin = star.rayLong + 18;

  if (!reducedMotion.matches && time > star.nextBlink) {
    const isLanding = scrollY < window.innerHeight * 0.86;
    star.x = makeFeatureStarX(star.zone, margin, isLanding);
    star.y = scrollY * star.speed + randomBetween(margin, window.innerHeight - margin);
    star.palette = featureStarPalettes[Math.floor(Math.random() * featureStarPalettes.length)];
    star.hue = star.palette.hue;
    star.blinkStart = time;
    star.blinkDuration = randomBetween(2100, 3200);
    star.nextBlink = time + star.blinkDuration + randomBetween(2200, 6200);
  }

  const blinkProgress = clamp((time - star.blinkStart) / star.blinkDuration, 0, 1);
  const blink = blinkProgress > 0 && blinkProgress < 1 ? Math.sin(Math.PI * blinkProgress) : 0;
  return reducedMotion.matches ? star.alpha * 0.22 : star.alpha * blink;
}

function drawStars(time = 0) {
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const scrollY = window.scrollY || window.pageYOffset || 0;
  const span = Math.max(document.documentElement.scrollHeight, window.innerHeight * 2);

  for (const star of sideStars) {
    const y = wrapY(star.y - scrollY * star.speed, span);
    if (y < -12 || y > window.innerHeight + 12) continue;

    const flicker = reducedMotion.matches ? 1 : 0.72 + Math.sin(time * star.twinkle + star.phase) * 0.28;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${star.hue}, ${star.alpha * flicker})`;
    ctx.arc(star.x, y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const star of featureStars) {
    const alpha = updateFeatureStar(star, time, span, scrollY);
    const y = wrapY(star.y - scrollY * star.speed, span);
    const margin = star.rayLong + 18;
    if (y < margin || y > window.innerHeight - margin) continue;
    if (star.x < margin || star.x > window.innerWidth - margin) continue;
    if (alpha < 0.025) continue;

    drawFeatureStar(star, star.x, y, alpha);
  }

  if (!reducedMotion.matches && time > nextMeteor) {
    meteors.push(makeMeteor(time));
    nextMeteor = time + randomBetween(3200, 9200);
  }

  meteors = meteors.filter((meteor) => drawMeteor(meteor, time));

  animationFrame = requestAnimationFrame(drawStars);
}

function getRevealGroups() {
  return [
    {
      trigger: "#about",
      items: [
        "#about > .section-kicker",
        "#about .intro-copy h2",
        "#about .intro-copy p",
        "#about .signal-panel",
      ],
      stagger: 0.11,
    },
    {
      trigger: "#work",
      items: [
        "#work .section-heading .section-kicker",
        "#work .section-heading h2",
        "#work .showcase-carousel",
      ],
      stagger: 0.13,
    },
    {
      trigger: "#process",
      items: [
        "#process > .section-kicker",
        "#process .process-copy > h2",
        "#process .process-list > div",
      ],
      stagger: 0.1,
    },
    {
      trigger: "#contact",
      items: [
        "#contact .section-kicker",
        "#contact h2",
        "#contact .contact-link",
      ],
      stagger: 0.1,
    },
  ];
}

function getRevealElements() {
  return getRevealGroups().flatMap((group) =>
    group.items.flatMap((selector) => Array.from(document.querySelectorAll(selector))),
  );
}

function showRevealElementsImmediately() {
  document.documentElement.classList.remove("reveal-ready");
  getRevealElements().forEach((element) => {
    element.classList.add("reveal-item");
    element.style.opacity = "1";
    element.style.filter = "none";
    element.style.transform = "none";
    element.style.willChange = "auto";
  });
}

function setupScrollReveals() {
  const prefersReducedMotion = reducedMotion.matches;
  const hasGsap = Boolean(window.gsap && window.ScrollTrigger);
  const revealElements = getRevealElements();

  revealElements.forEach((element) => element.classList.add("reveal-item"));

  if (prefersReducedMotion || !hasGsap) {
    showRevealElementsImmediately();
    return;
  }

  const isCompact = window.matchMedia("(max-width: 720px)").matches;
  const startY = isCompact ? 34 : 48;

  const plugins = [window.ScrollTrigger];
  if (window.CustomEase) plugins.push(window.CustomEase);
  window.gsap.registerPlugin(...plugins);
  const revealEase = window.CustomEase
    ? window.CustomEase.create("appleReveal", "M0,0 C0.22,1 0.36,1 1,1")
    : "expo.out";

  window.gsap.set(revealElements, {
    autoAlpha: 0,
    y: startY,
    scale: 0.98,
    filter: "blur(8px)",
  });
  document.documentElement.classList.add("reveal-ready");

  getRevealGroups().forEach((group) => {
    const trigger = document.querySelector(group.trigger);
    const items = group.items.flatMap((selector) => Array.from(document.querySelectorAll(selector)));

    if (!trigger || items.length === 0) return;

    const timeline = window.gsap.timeline({
      paused: true,
      defaults: {
        duration: 1,
        ease: revealEase,
      },
    }).to(items, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      stagger: group.stagger,
      clearProps: "transform,filter,willChange",
    });

    window.ScrollTrigger.create({
      trigger,
      start: "top 78%",
      end: "bottom 18%",
      onEnter: () => timeline.restart(),
      onEnterBack: () => timeline.restart(),
      onLeave: () => {
        timeline.pause(0);
        window.gsap.set(items, {
          autoAlpha: 0,
          y: startY,
          scale: 0.98,
          filter: "blur(8px)",
        });
      },
      onLeaveBack: () => {
        timeline.pause(0);
        window.gsap.set(items, {
          autoAlpha: 0,
          y: startY,
          scale: 0.98,
          filter: "blur(8px)",
        });
      },
    });
  });
}

function setupContactCopy() {
  const contactLink = document.querySelector("[data-copy-email]");

  if (!contactLink) {
    return;
  }

  const email = contactLink.dataset.copyEmail || contactLink.textContent.trim();
  let restoreTimer;

  const showCopied = () => {
    window.clearTimeout(restoreTimer);
    contactLink.textContent = "Copied";
    restoreTimer = window.setTimeout(() => {
      contactLink.textContent = email;
    }, 1300);
  };

  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = email;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  contactLink.addEventListener("click", async (event) => {
    event.preventDefault();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(email);
      } else {
        fallbackCopy();
      }

      showCopied();
    } catch {
      fallbackCopy();
      showCopied();
    }
  });
}

function setupChannelCarousel() {
  const carousel = document.querySelector("[data-channel-carousel]");

  if (!carousel) {
    return;
  }

  const stage = carousel.querySelector(".showcase-stage");
  const cards = Array.from(carousel.querySelectorAll("[data-carousel-card]"));
  const previousButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");

  if (!stage || cards.length === 0) {
    return;
  }

  let currentIndex = 0;
  let wheelLock = false;

  const updateCards = () => {
    const previousIndex = (currentIndex - 1 + cards.length) % cards.length;
    const nextIndex = (currentIndex + 1) % cards.length;

    cards.forEach((card, index) => {
      card.classList.toggle("is-active", index === currentIndex);
      card.classList.toggle("is-previous", index === previousIndex);
      card.classList.toggle("is-next", index === nextIndex);
      card.setAttribute("aria-hidden", index === currentIndex ? "false" : "true");
    });
  };

  const goToSlide = (index) => {
    currentIndex = (index + cards.length) % cards.length;
    updateCards();
  };

  previousButton?.addEventListener("click", () => {
    goToSlide(currentIndex - 1);
  });

  nextButton?.addEventListener("click", () => {
    goToSlide(currentIndex + 1);
  });

  stage.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) < 8 && Math.abs(event.deltaX) < 8) {
      return;
    }

    event.preventDefault();

    if (wheelLock) {
      return;
    }

    wheelLock = true;
    const direction = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    goToSlide(currentIndex + (direction > 0 ? 1 : -1));

    window.setTimeout(() => {
      wheelLock = false;
    }, reducedMotion.matches ? 180 : 620);
  }, { passive: false });

  stage.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToSlide(currentIndex - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToSlide(currentIndex + 1);
    }
  });

  updateCards();
}

window.addEventListener("load", setupScrollReveals);
window.addEventListener("load", setupContactCopy);
window.addEventListener("load", setupChannelCarousel);

window.addEventListener("pointermove", (event) => {
  const isNearBottom = event.clientY > window.innerHeight * 0.72;
  document.body.classList.toggle("is-bottom-nav-visible", isNearBottom);
});

window.addEventListener("mouseout", (event) => {
  if (!event.relatedTarget) {
    document.body.classList.remove("is-bottom-nav-visible");
  }
});

window.addEventListener("resize", () => {
  resizeCanvas();
});
resizeCanvas();
animationFrame = requestAnimationFrame(drawStars);
