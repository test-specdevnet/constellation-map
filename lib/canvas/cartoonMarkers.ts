/**
 * Cartoon aviation-style markers for tour / playful map mode.
 * Deployments stay fixed; camera motion sells the "flight" feel.
 */

export type MarkerVariant = "pad" | "tower" | "beacon";

const POP_PALETTE = [
  "#FF3366",
  "#00D4AA",
  "#FFAA00",
  "#6C5CE7",
  "#00B4FF",
  "#FF6B9D",
  "#2B61D1",
  "#FDE74C",
] as const;

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

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

/** Subtle "pop" overshoot for cartoon motion (0..1). */
export const easePop = (t: number): number => {
  const clamped = Math.max(0, Math.min(1, t));
  return easeOutBackInternal(clamped);
};

export type DrawCartoonMarkerOptions = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  accent: string;
  variant: MarkerVariant;
  /** ~0..1 scale factor from camera/resolution */
  baseScale: number;
  /** Bouncy pop 0..1 */
  pop: number;
  highlight: boolean;
};

/** Thick-outline cel-shaded marker. */
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
  const s = baseScale * (1 + 0.12 * pop);
  const outline = "#1a0a2e";
  const lineW = Math.max(2.5, 3 * Math.sqrt(baseScale));

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  const light = highlight ? 1.15 : 1;
  ctx.strokeStyle = outline;
  ctx.lineWidth = lineW / s;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (variant === "pad") {
    // Hex landing pad
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * 14;
      const py = Math.sin(a) * 14;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = shade(accent, 0.85 * light);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff5";
    ctx.fill();
    ctx.stroke();
  } else if (variant === "tower") {
    // Stacked blocks (mooring mast vibe)
    ctx.fillStyle = shade(accent, 0.9 * light);
    ctx.strokeStyle = outline;
    drawRoundRect(ctx, -6, -18, 12, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(accent, 1 * light);
    drawRoundRect(ctx, -8, -8, 16, 12, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(accent, 0.75 * light);
    drawRoundRect(ctx, -10, 6, 20, 8, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, -24);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -26, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
  } else {
    // Beacon rings
    for (let r = 3; r <= 9; r += 3) {
      ctx.beginPath();
      ctx.arc(0, 0, r + pop * 2, 0, Math.PI * 2);
      ctx.strokeStyle =
        r === 9 ? outline : accent;
      ctx.globalAlpha = r === 3 ? 1 : 0.55;
      ctx.lineWidth = (lineW / s) * (r === 3 ? 1.2 : 0.85);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, 14);
    ctx.stroke();
    ctx.fillStyle = shade(accent, light);
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function shade(hex: string, mult: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r * mult)},${clamp(g * mult)},${clamp(b * mult)})`;
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Fluffy cel-shaded cloud blobs (screen space, parallax). */
export function drawCartoonCloudPuffs(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timestamp: number,
) {
  const outline = "rgba(12, 34, 72, 0.85)";
  const seeds = [
    { x: 0.12, y: 0.72, r: 0.14, layer: 0 },
    { x: 0.42, y: 0.68, r: 0.11, layer: 1 },
    { x: 0.78, y: 0.74, r: 0.16, layer: 0 },
    { x: 0.22, y: 0.18, r: 0.09, layer: 2 },
    { x: 0.88, y: 0.22, r: 0.1, layer: 1 },
  ];

  for (const s of seeds) {
    const drift = Math.sin(timestamp / 2400 + s.layer * 1.7) * 12;
    const bob = Math.cos(timestamp / 1900 + s.x * 10) * 6;
    const cx = s.x * width + drift;
    const cy = s.y * height + bob;
    const baseR = s.r * Math.min(width, height);

    ctx.save();
    for (let i = 0; i < 4; i += 1) {
      const ox = (i - 1.5) * baseR * 0.35;
      const oy = Math.sin(i + timestamp / 4000) * baseR * 0.08;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, baseR * (0.45 + i * 0.06), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.38 - i * 0.05})`;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = outline;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
