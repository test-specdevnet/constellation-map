/**
 * Cartoon sky layers, unified deployment buoys, player biplane.
 */

import type { BuoyColorway } from "./buoyCategory";

const PIX = 3;

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

export const snapPixel = (value: number) => Math.round(value / PIX) * PIX;

export type BuoyProximityTier = 0 | 1 | 2;

export type DrawDeploymentBuoyOptions = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  colors: BuoyColorway;
  baseScale: number;
  /** Deterministic animation phase */
  seed: string;
  proximity: BuoyProximityTier;
  selected: boolean;
  searchOrPointer: boolean;
  timestamp: number;
};

function hexPath(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function mixHex(hex: string, t: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const c = (v: number) => Math.round(255 + (v - 255) * t);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/**
 * Single canonical buoy: hex body, glowing core, mount, antenna + beacon ring.
 * Same silhouette for every deployment; only colorway changes.
 */
export function drawDeploymentBuoy({
  ctx,
  x,
  y,
  colors,
  baseScale,
  seed,
  proximity,
  selected,
  searchOrPointer,
  timestamp,
}: DrawDeploymentBuoyOptions) {
  const sx = snapPixel(x);
  const sy = snapPixel(y);
  const s = baseScale;
  const h = hashString(seed);
  const phase = h * 0.001;
  const outline = "#0E1628";
  const lineW = Math.max(2.4, 2.85 * Math.sqrt(baseScale)) / s;

  const idleBob = Math.sin(timestamp / 4200 + phase) * 1.1;
  const beaconPulse = 0.55 + 0.45 * Math.sin(timestamp / 900 + phase * 2);
  const nearBoost = proximity >= 1 ? 1.06 : 1;
  const focusBoost = proximity >= 2 ? 1.08 : 1;
  const highlightBoost = selected || searchOrPointer ? 1.1 : 1;

  ctx.save();
  ctx.translate(sx, sy + idleBob);
  ctx.scale(s, s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const R = 13;
  const coreR = 5.2;

  // Mount (darker trapezoid feel — wider base)
  ctx.beginPath();
  ctx.moveTo(-9, 10);
  ctx.lineTo(9, 10);
  ctx.lineTo(7, 16);
  ctx.lineTo(-7, 16);
  ctx.closePath();
  ctx.fillStyle = mixHex(colors.trim, 0.35);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = lineW;
  ctx.stroke();

  // Hex hull
  hexPath(ctx, R);
  const grad = ctx.createLinearGradient(-R, -R, R, R);
  grad.addColorStop(0, mixHex(colors.light, 0.15 * highlightBoost * nearBoost));
  grad.addColorStop(0.55, colors.main);
  grad.addColorStop(1, mixHex(colors.trim, -0.2));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.stroke();

  // Inner core glow
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fillStyle = colors.core;
  ctx.globalAlpha = 0.92 * focusBoost;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = outline;
  ctx.lineWidth = lineW * 0.9;
  ctx.stroke();

  // Antenna + beacon ring (always same geometry)
  const ax = 0;
  const ay = -R - 1;
  ctx.beginPath();
  ctx.moveTo(0, -R + 1);
  ctx.lineTo(ax, ay - 5);
  ctx.strokeStyle = outline;
  ctx.lineWidth = lineW * 0.95;
  ctx.stroke();

  const ringR = 5.2 + (proximity >= 1 ? beaconPulse * 0.6 : beaconPulse * 0.35);
  ctx.beginPath();
  ctx.arc(ax, ay - 7, ringR, -Math.PI * 0.85, -Math.PI * 0.15);
  ctx.strokeStyle = colors.beacon;
  ctx.globalAlpha = 0.45 + (proximity >= 2 ? 0.35 : proximity >= 1 ? 0.2 : 0.1) * beaconPulse;
  ctx.lineWidth = lineW * 1.05;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(ax, ay - 7, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = mixHex(colors.beacon, -0.15);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = lineW * 0.75;
  ctx.stroke();

  if (selected || searchOrPointer) {
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = lineW * 0.9;
    hexPath(ctx, R + 2.2);
    ctx.stroke();
  }

  ctx.restore();
}

type Puff = { bx: number; by: number; br: number };

function drawOutlinedCloud(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  outline: string,
  fill: string,
  lineW: number,
) {
  const puffs: Puff[] = [
    { bx: -0.45, by: 0.05, br: 0.38 },
    { bx: 0.15, by: -0.08, br: 0.42 },
    { bx: 0.52, by: 0.08, br: 0.34 },
    { bx: 0.02, by: 0.18, br: 0.36 },
  ];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale * 0.92);
  ctx.beginPath();
  for (const p of puffs) {
    ctx.moveTo(p.br + p.bx, p.by);
    ctx.arc(p.bx, p.by, p.br, 0, Math.PI * 2);
  }
  ctx.fillStyle = "rgba(65, 110, 180, 0.22)";
  ctx.fill();
  ctx.beginPath();
  for (const p of puffs) {
    ctx.moveTo(p.br + p.bx, p.by);
    ctx.arc(p.bx, p.by, p.br, 0, Math.PI * 2);
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineW;
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.restore();
}

const LAYER_SEEDS = [
  { x: 0.12, y: 0.78, s: 0.42, speed: 0.018, layer: 0 },
  { x: 0.55, y: 0.82, s: 0.5, speed: 0.012, layer: 0 },
  { x: 0.88, y: 0.74, s: 0.38, speed: 0.022, layer: 0 },
  { x: 0.22, y: 0.48, s: 0.36, speed: 0.028, layer: 1 },
  { x: 0.72, y: 0.52, s: 0.4, speed: 0.02, layer: 1 },
  { x: 0.48, y: 0.62, s: 0.32, speed: 0.015, layer: 1 },
  { x: 0.08, y: 0.28, s: 0.28, speed: 0.035, layer: 2 },
  { x: 0.62, y: 0.22, s: 0.3, speed: 0.03, layer: 2 },
  { x: 0.92, y: 0.18, s: 0.26, speed: 0.04, layer: 2 },
];

/**
 * Distant / mid / foreground cartoon clouds with horizontal parallax tied to camera.
 */
export function drawParallaxCloudLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timestamp: number,
  camX: number,
  camY: number,
  opts?: { layerMin?: number; layerMax?: number },
) {
  const lo = opts?.layerMin ?? 0;
  const hi = opts?.layerMax ?? 2;
  const short = Math.min(width, height);
  for (const L of LAYER_SEEDS) {
    if (L.layer < lo || L.layer > hi) continue;
    const parallax = (L.layer + 1) * 0.022;
    const drift = timestamp / (4500 + L.layer * 800) + L.x * 6;
    const ox = Math.sin(drift) * 14 + camX * parallax * 0.08;
    const oy = Math.cos(drift * 0.7) * 6 + camY * parallax * 0.05;
    const cx = (L.x * width + ox) % (width + 200);
    const cy = L.y * height + oy;
    const wrapX = cx < -100 ? cx + width + 200 : cx;
    const alpha = L.layer === 0 ? 0.55 : L.layer === 1 ? 0.72 : 0.88;
    const fill = `rgba(255,255,255,${alpha})`;
    const lw = L.layer === 2 ? 2.4 : L.layer === 1 ? 2.1 : 1.85;
    drawOutlinedCloud(ctx, wrapX, cy, short * L.s, "#0E1A30", fill, lw);
  }
}

/** Tiny stars in upper sky only */
export function drawUpperSparkles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timestamp: number,
) {
  ctx.save();
  for (let i = 0; i < 48; i += 1) {
    const sx = ((i * 97) % width) + Math.sin(timestamp / 9000 + i) * 3;
    const sy = ((i * 53) % (height * 0.42)) + 8;
    const tw = 0.35 + (i % 5) * 0.08;
    const a = 0.2 + (i % 4) * 0.12 + Math.sin(timestamp / 2000 + i) * 0.06;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((i * Math.PI) / 7 + timestamp / 12000);
    ctx.fillRect(-tw, -4, tw * 2, 8);
    ctx.fillRect(-4, -tw, 8, tw * 2);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Classic red biplane, top-down. +x = nose. `bankRad` rolls the sprite when turning.
 */
export function drawTopDownBiplane(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  headingRad: number,
  bankRad: number,
  timestamp: number,
) {
  const prop = (timestamp / 32) % (Math.PI * 2);
  const bob = Math.sin(timestamp / 380) * 1.2;

  ctx.save();
  ctx.translate(snapPixel(cx), snapPixel(cy + bob));
  ctx.rotate(headingRad);
  ctx.rotate(clamp(bankRad, -0.45, 0.45));

  const body = "#D81F26";
  const bodyHi = "#F25555";
  const wing = "#B81820";
  const wingHi = "#E84850";
  const trim = "#0F1B32";
  const outline = "#0a0810";

  ctx.lineJoin = "round";
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = outline;

  // Upper wing (full span)
  const wg = ctx.createLinearGradient(0, -38, 0, 38);
  wg.addColorStop(0, wingHi);
  wg.addColorStop(0.5, wing);
  wg.addColorStop(1, wingHi);
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.moveTo(-11, -40);
  ctx.lineTo(8, -40);
  ctx.lineTo(10, 40);
  ctx.lineTo(-11, 40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Lower wing shadow hint (slightly offset)
  ctx.fillStyle = "rgba(40,10,12,0.35)";
  ctx.beginPath();
  ctx.moveTo(-8, -34);
  ctx.lineTo(6, -34);
  ctx.lineTo(8, 36);
  ctx.lineTo(-9, 36);
  ctx.closePath();
  ctx.fill();

  // Fuselage (rounded cigar, nose +x)
  const fg = ctx.createLinearGradient(-26, 0, 32, 0);
  fg.addColorStop(0, wing);
  fg.addColorStop(0.35, body);
  fg.addColorStop(0.7, bodyHi);
  fg.addColorStop(1, body);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(32, 0);
  ctx.bezierCurveTo(28, 10, 8, 11, -6, 9);
  ctx.bezierCurveTo(-22, 7, -30, 4, -32, 0);
  ctx.bezierCurveTo(-30, -4, -22, -7, -6, -9);
  ctx.bezierCurveTo(8, -11, 28, -10, 32, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Navy trim stripe
  ctx.strokeStyle = trim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -5);
  ctx.lineTo(18, -5);
  ctx.moveTo(-8, 5);
  ctx.lineTo(18, 5);
  ctx.stroke();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3.2;

  // Tail
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.lineTo(-40, -12);
  ctx.lineTo(-38, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cockpit
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.ellipse(6, 0, 7, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Yellow prop hub + motion arcs
  ctx.fillStyle = "#F5D030";
  ctx.beginPath();
  ctx.arc(34, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "rgba(245,208,48,0.55)";
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.arc(34, 0, 12, prop, prop + Math.PI * 1.25);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(34, 0, 7, -prop * 1.1, -prop * 1.1 + Math.PI);
  ctx.stroke();

  ctx.restore();
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Rounded pill hover card above a buoy (proximity flight). */
export function drawProximityHoverCard(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  title: string,
  subtitle: string,
  alpha: number,
) {
  if (alpha < 0.03) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const padX = 14;
  const padY = 10;
  ctx.font = "600 14px Segoe UI, system-ui, sans-serif";
  const tw = ctx.measureText(title).width;
  ctx.font = "11px Segoe UI, system-ui, sans-serif";
  const sw = subtitle ? ctx.measureText(subtitle).width : 0;
  const boxW = Math.min(320, Math.max(tw, sw) + padX * 2);
  const boxH = subtitle ? 52 : 34;
  const rx = screenX - boxW / 2;
  const ry = screenY - boxH - 22;
  const r = 14;

  ctx.beginPath();
  ctx.roundRect(rx, ry, boxW, boxH, r);
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#0E1628";
  ctx.stroke();

  ctx.fillStyle = "#0E1628";
  ctx.font = "600 14px Segoe UI, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(title, rx + padX, ry + padY + 9);
  if (subtitle) {
    ctx.font = "11px Segoe UI, system-ui, sans-serif";
    ctx.fillStyle = "rgba(14,22,40,0.72)";
    ctx.fillText(subtitle, rx + padX, ry + padY + 28);
  }
  ctx.restore();
}
