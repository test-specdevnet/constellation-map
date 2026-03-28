/**
 * Aviation-style deployment markers + soft sky clouds (explore + tour).
 * Avoids stroked overlapping circles (reads as splotchy noise).
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

export const snapPixel = (value: number) => Math.round(value / PIX) * PIX;

export const getCartoonAccent = (key: string): string =>
  POP_PALETTE[hashString(key) % POP_PALETTE.length];

export const getMarkerVariant = (key: string): MarkerVariant => {
  const h = hashString(`variant:${key}`);
  if (h % 3 === 0) return "pad";
  if (h % 3 === 1) return "tower";
  return "beacon";
};

export type DrawCartoonMarkerOptions = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  accent: string;
  variant: MarkerVariant;
  baseScale: number;
  highlight: boolean;
  /** Thinner outlines in explore mode. */
  chunkyOutline: boolean;
};

/** Landing pad / tower / beacon markers. */
export function drawCartoonMarker({
  ctx,
  x,
  y,
  accent,
  variant,
  baseScale,
  highlight,
  chunkyOutline,
}: DrawCartoonMarkerOptions) {
  const sx = chunkyOutline ? snapPixel(x) : x;
  const sy = chunkyOutline ? snapPixel(y) : y;
  const s = baseScale;
  const outline = "#0a0a12";
  const lineW = chunkyOutline
    ? Math.max(2.5, 3.2 * Math.sqrt(baseScale))
    : Math.max(1.8, 2.2 * Math.sqrt(baseScale));

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(s, s);

  const light = highlight ? 1.08 : 1;
  ctx.lineJoin = chunkyOutline ? "miter" : "round";
  ctx.lineCap = chunkyOutline ? "butt" : "round";
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
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = r === 4 ? outline : accent;
      ctx.lineWidth = r === 4 ? (lineW / s) * 1.05 : (lineW / s) * 0.8;
      ctx.globalAlpha = r === 4 ? 1 : 0.55;
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

/** Sparse soft clouds for normal map (sky read, not noise). */
const EXPLORE_CLOUD_SEEDS: CloudSeed[] = [
  { x: 0.18, y: 0.22, r: 0.11, layer: 0 },
  { x: 0.72, y: 0.2, r: 0.1, layer: 1 },
  { x: 0.48, y: 0.55, r: 0.09, layer: 0 },
  { x: 0.12, y: 0.68, r: 0.12, layer: 1 },
  { x: 0.86, y: 0.72, r: 0.1, layer: 0 },
];

/** Tour: a few more puffs, still fill-only. */
const TOUR_CLOUD_SEEDS: CloudSeed[] = [
  { x: 0.15, y: 0.75, r: 0.13, layer: 0 },
  { x: 0.45, y: 0.7, r: 0.1, layer: 1 },
  { x: 0.8, y: 0.78, r: 0.14, layer: 0 },
  { x: 0.25, y: 0.2, r: 0.085, layer: 2 },
  { x: 0.78, y: 0.22, r: 0.095, layer: 1 },
  { x: 0.52, y: 0.42, r: 0.08, layer: 2 },
  { x: 0.08, y: 0.42, r: 0.07, layer: 1 },
  { x: 0.92, y: 0.48, r: 0.075, layer: 2 },
];

function drawSoftCloudCluster(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  timestamp: number,
  alphaBase: number,
) {
  const n = 4;
  for (let i = 0; i < n; i += 1) {
    const ox = (i - (n - 1) / 2) * baseR * 0.38;
    const oy = Math.sin(i * 1.2 + timestamp / 5000) * baseR * 0.05;
    const pr = baseR * (0.5 + i * 0.07);
    const a = Math.max(0.06, alphaBase - i * 0.035);
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy, pr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fill();
  }
}

export type SkyCloudKind = "explore" | "tour";

/**
 * Soft cloud masses — fills only (no per-bubble black strokes).
 */
export function drawSkyCloudLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timestamp: number,
  kind: SkyCloudKind,
) {
  const seeds = kind === "tour" ? TOUR_CLOUD_SEEDS : EXPLORE_CLOUD_SEEDS;
  const alphaBase = kind === "tour" ? 0.22 : 0.14;

  for (const s of seeds) {
    const drift = Math.sin(timestamp / 3200 + s.layer * 1.4) * 8;
    const bob = Math.cos(timestamp / 2600 + s.x * 6) * 5;
    const cx = s.x * width + drift;
    const cy = s.y * height + bob;
    const baseR = s.r * Math.min(width, height);
    drawSoftCloudCluster(ctx, cx, cy, baseR, timestamp, alphaBase);
  }
}

/**
 * Top-down Club Penguin–style biplane at screen center.
 * Local +x is the nose; `headingRad` is world heading (velocity = cos/sin).
 */
export function drawTopDownBiplane(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  headingRad: number,
  timestamp: number,
) {
  const prop = (timestamp / 38) % (Math.PI * 2);
  const bob = Math.sin(timestamp / 320) * 2;

  ctx.save();
  ctx.translate(snapPixel(cx), snapPixel(cy + bob));
  ctx.rotate(headingRad);

  const body = "#E62822";
  const wingTop = "#FF5A52";
  const wingBot = "#C41E1A";
  const outline = "#1a0505";

  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = outline;

  // Lower wing (slightly shorter — reads as stacked in top-down)
  ctx.fillStyle = wingBot;
  ctx.beginPath();
  ctx.moveTo(-4, 30);
  ctx.lineTo(6, 30);
  ctx.lineTo(10, 34);
  ctx.lineTo(-8, 34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-4, -30);
  ctx.lineTo(6, -30);
  ctx.lineTo(10, -34);
  ctx.lineTo(-8, -34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Main wing span (perpendicular to fuselage)
  ctx.fillStyle = wingTop;
  ctx.beginPath();
  ctx.roundRect(-10, -40, 20, 80, 5);
  ctx.fill();
  ctx.stroke();

  // Fuselage + nose (along +x)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(12, 9);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-28, 5);
  ctx.lineTo(-32, 0);
  ctx.lineTo(-28, -5);
  ctx.lineTo(-10, -8);
  ctx.lineTo(12, -9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Tail boom + vertical stabilizer hint
  ctx.fillStyle = wingBot;
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(-44, 0);
  ctx.lineTo(-48, 10);
  ctx.lineTo(-52, 0);
  ctx.lineTo(-48, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cockpit bubble
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.beginPath();
  ctx.arc(4, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Prop disk at nose
  ctx.strokeStyle = "rgba(30,30,40,0.45)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(36, 0, 11, prop, prop + Math.PI * 1.35);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(36, 0, 6, -prop * 1.2, -prop * 1.2 + Math.PI * 1.1);
  ctx.stroke();

  ctx.restore();
}
