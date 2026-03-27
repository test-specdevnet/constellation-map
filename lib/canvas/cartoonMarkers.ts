/**
 * Cartoon aviation-style markers + dense pixel-snapped clouds
 * (Club Penguin–inspired: chunky outlines, snapped coordinates).
 */

export type MarkerVariant = "pad" | "tower" | "beacon";

const PIX = 3;

const POP_PALETTE = [
  "#FF3366",
  "#00E5A5",
  "#FFCC00",
  "#7C6BFF",
  "#00C8FF",
  "#FF70B8",
  "#2B61D1",
  "#FFF15C",
  "#FF6B35",
  "#9D4EDD",
] as const;

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

/** Snap to a coarse pixel grid so shapes read chunky / flash-game adjacent. */
export const snapPixel = (value: number) => Math.round(value / PIX) * PIX;

export const getCartoonAccent = (key: string): string =>
  POP_PALETTE[hashString(key) % POP_PALETTE.length];

export const getMarkerVariant = (key: string): MarkerVariant => {
  const h = hashString(`variant:${key}`);
  if (h % 3 === 0) return "pad";
  if (h % 3 === 1) return "tower";
  return "beacon";
};

const easeOutBackInternal = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

export const easePop = (t: number) => {
  const clamped = Math.max(0, Math.min(1, t));
  return easeOutBackInternal(clamped);
};

export type DrawCartoonMarkerOptions = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  accent: string;
  variant: MarkerVariant;
  baseScale: number;
  pop: number;
  highlight: boolean;
};

/** Thick black-outline “sprite” markers. */
export function drawCartoonMarker({
  ctx,
  x,
  y,
  accent,
  variant,
  baseScale,
  pop,
  highlight,
}: DrawCartoonMarkerOptions) {
  const sx = snapPixel(x);
  const sy = snapPixel(y);
  const s = baseScale * (1 + 0.1 * pop);
  const outline = "#0a0a12";
  const lineW = Math.max(3, 3.4 * Math.sqrt(baseScale));

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(s, s);

  const light = highlight ? 1.12 : 1;
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  ctx.miterLimit = 2;
  ctx.lineWidth = lineW / s;
  ctx.strokeStyle = outline;

  if (variant === "pad") {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * 15;
      const py = Math.sin(a) * 15;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = shade(accent, 0.92 * light);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = highlight ? "#fff" : "#f8f8ff";
    ctx.fill();
    ctx.stroke();
  } else if (variant === "tower") {
    // Pixel blocks (no rounded corners)
    strokeFillRect(ctx, -7, 8, 20, 9, outline, shade(accent, 0.78 * light), lineW / s);
    strokeFillRect(ctx, -8, -2, 18, 12, outline, shade(accent, 0.95 * light), lineW / s);
    strokeFillRect(ctx, -6, -18, 14, 18, outline, shade(accent, 0.88 * light), lineW / s);
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, -26);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-3, -30, 6, 6);
    ctx.strokeRect(-3, -30, 6, 6);
  } else {
    for (const r of [10, 7, 4]) {
      ctx.beginPath();
      ctx.arc(0, 0, r + Math.round(pop * 2), 0, Math.PI * 2);
      ctx.strokeStyle = r === 4 ? outline : accent;
      ctx.lineWidth = r === 4 ? (lineW / s) * 1.1 : (lineW / s) * 0.85;
      ctx.globalAlpha = r === 4 ? 1 : 0.65;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, 16);
    ctx.stroke();
    ctx.fillStyle = shade(accent, light);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeRect(-4, -4, 8, 8);
  }

  ctx.restore();
}

function strokeFillRect(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  w: number,
  h: number,
  stroke: string,
  fill: string,
  lw: number,
) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.fillRect(rx, ry, w, h);
  ctx.strokeRect(rx, ry, w, h);
}

function shade(hex: string, mult: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r * mult)},${clamp(g * mult)},${clamp(b * mult)})`;
}

type CloudSeed = { x: number; y: number; r: number; layer: number };

const CLOUD_SEEDS: CloudSeed[] = [
  { x: 0.12, y: 0.72, r: 0.14, layer: 0 },
  { x: 0.42, y: 0.68, r: 0.11, layer: 1 },
  { x: 0.78, y: 0.74, r: 0.16, layer: 0 },
  { x: 0.22, y: 0.18, r: 0.09, layer: 2 },
  { x: 0.88, y: 0.22, r: 0.1, layer: 1 },
  { x: 0.58, y: 0.16, r: 0.085, layer: 2 },
  { x: 0.32, y: 0.49, r: 0.095, layer: 1 },
  { x: 0.67, y: 0.47, r: 0.082, layer: 2 },
  { x: 0.08, y: 0.38, r: 0.078, layer: 2 },
  { x: 0.94, y: 0.52, r: 0.088, layer: 1 },
  { x: 0.5, y: 0.82, r: 0.072, layer: 2 },
  { x: 0.72, y: 0.28, r: 0.068, layer: 1 },
  { x: 0.15, y: 0.58, r: 0.064, layer: 2 },
  { x: 0.38, y: 0.28, r: 0.056, layer: 2 },
  { x: 0.62, y: 0.62, r: 0.07, layer: 1 },
  { x: 0.05, y: 0.12, r: 0.05, layer: 2 },
  { x: 0.48, y: 0.38, r: 0.06, layer: 1 },
  { x: 0.85, y: 0.68, r: 0.074, layer: 0 },
  { x: 0.28, y: 0.86, r: 0.058, layer: 2 },
  { x: 0.55, y: 0.08, r: 0.052, layer: 1 },
];

/** Dense fluffy clouds; coordinates snapped for chunky / pixel-adjacent look. */
export function drawCartoonCloudPuffs(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timestamp: number,
) {
  const outline = "#061428";
  const drawCluster = (cx: number, cy: number, baseR: number, layer: number) => {
    for (let i = 0; i < 6; i += 1) {
      const ox = (i - 2.5) * baseR * 0.32;
      const oy = Math.sin(i * 1.1 + timestamp / 4000) * baseR * 0.07;
      const px = snapPixel(cx + ox);
      const py = snapPixel(cy + oy);
      const pr = Math.max(PIX * 2, snapPixel(baseR * (0.42 + i * 0.055)));
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.44 - i * 0.055})`;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = outline;
      ctx.globalAlpha = 0.78;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (let wisp = 0; wisp < 3; wisp += 1) {
      const wx = snapPixel(cx + (wisp - 1) * baseR * 0.55);
      const wy = snapPixel(cy + (wisp % 2 === 0 ? 1 : -1) * baseR * 0.28);
      ctx.beginPath();
      ctx.arc(wx, wy, snapPixel(baseR * 0.34), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fill();
    }
  };

  for (const s of CLOUD_SEEDS) {
    const drift = Math.sin(timestamp / 2400 + s.layer * 1.7) * (11 + s.layer * 2);
    const bob = Math.cos(timestamp / 1900 + s.x * 10) * (6 + s.layer);
    const cx = snapPixel(s.x * width + drift);
    const cy = snapPixel(s.y * height + bob);
    const baseR = s.r * Math.min(width, height);
    drawCluster(cx, cy, baseR, s.layer);
  }

  // Extra scattered mini-clusters across the sky
  for (let i = 0; i < 44; i += 1) {
    const h = hashString(`cloudmini:${i}`);
    const gx = ((h % 920) / 1000) * 0.92 + 0.04;
    const gy = (((h >>> 8) % 880) / 1000) * 0.88 + 0.06;
    const layer = h % 3;
    const bob = Math.sin(timestamp / 2100 + i * 0.4) * 4;
    const cx = snapPixel(gx * width + bob);
    const cy = snapPixel(gy * height + Math.cos(timestamp / 1700 + i) * 3);
    const baseR = (0.034 + (h % 200) / 5000) * Math.min(width, height);
    drawCluster(cx, cy, baseR * (0.75 + (layer * 0.12)), layer);
  }
}
