const COLORS = ["#FFD23F", "#FF6B6B", "#4ECDC4", "#A78BFA", "#FF8FB1", "#7FE0A0"];
const PARTICLES_PER_BURST = 45;
const GRAVITY = 0.045;
const DRAG = 0.985;
// Three staggered bursts around the anchor read as one small "show" rather
// than a single pop.
const BURST_OFFSETS = [
  { dx: -40, dy: -10, delay: 0 },
  { dx: 40, dy: 5, delay: 90 },
  { dx: 0, dy: -40, delay: 180 },
];

class Spark {
  constructor(x, y, color) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.color = color;
    this.life = 1;
    this.decay = 0.022 + Math.random() * 0.015;
    this.size = 1.5 + Math.random() * 1.8;
  }

  update() {
    this.prevX = this.x;
    this.prevY = this.y;
    this.vy += GRAVITY;
    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
  }

  // Draws a short fading line from the previous position to the current one
  // instead of a static dot — that line *is* the trail, so it works over any
  // page background without needing to dim the whole canvas each frame.
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(this.life, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.size;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.prevX, this.prevY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    ctx.restore();
  }
}

// Fires a brief, non-blocking firework burst centered on `anchorElement`
// (the revealed correct-answer button). Purely decorative: never disables
// input, never delays the "Next Question" flow, and cleans itself up once
// every spark has faded.
export function celebrateCorrectAnswer(anchorElement) {
  if (!anchorElement) return;

  const canvas = document.createElement("canvas");
  canvas.className = "celebration-canvas";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // No 2D canvas support (e.g. jsdom in tests) — skip the effect rather
    // than throwing.
    canvas.remove();
    return;
  }

  const rect = anchorElement.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  let sparks = [];
  let burstsPending = BURST_OFFSETS.length;

  function spawnBurst(dx, dy) {
    const colorA = COLORS[Math.floor(Math.random() * COLORS.length)];
    const colorB = COLORS[Math.floor(Math.random() * COLORS.length)];
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      sparks.push(new Spark(originX + dx, originY + dy, i % 2 === 0 ? colorA : colorB));
    }
    burstsPending -= 1;
  }

  const timers = BURST_OFFSETS.map(({ dx, dy, delay }) =>
    setTimeout(() => spawnBurst(dx, dy), delay),
  );

  let frameHandle = null;

  function cleanup() {
    if (frameHandle !== null) cancelAnimationFrame(frameHandle);
    timers.forEach((timer) => clearTimeout(timer));
    canvas.remove();
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sparks.forEach((spark) => {
      spark.update();
      spark.draw(ctx);
    });
    sparks = sparks.filter((spark) => spark.life > 0);

    if (burstsPending === 0 && sparks.length === 0) {
      cleanup();
      return;
    }
    frameHandle = requestAnimationFrame(tick);
  }

  frameHandle = requestAnimationFrame(tick);
}
