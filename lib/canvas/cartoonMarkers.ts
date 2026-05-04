/**
 * Cartoon sky layers, unified deployment buoys, player biplane.
 */

import type { BuoyColorway } from "./buoyCategory";

const PIX = 1;

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

export type PlaneSkinId =
  | "classic"
  | "sunset-scout"
  | "mint-radar"
  | "midnight-courier";

export type PlaneSkinPalette = {
  body: string;
  bodyHi: string;
  wing: string;
  wingHi: string;
  trim: string;
  cockpit: string;
  prop: string;
  propGlow: string;
};

export const planeSkinPalettes: Record<PlaneSkinId, PlaneSkinPalette> = {
  classic: {
    body: "#D81F26",
    bodyHi: "#F25555",
    wing: "#B81820",
    wingHi: "#E84850",
    trim: "#0F1B32",
    cockpit: "rgba(255,255,255,0.9)",
    prop: "#F5D030",
    propGlow: "rgba(245,208,48,0.55)",
  },
  "sunset-scout": {
    body: "#F2C431",
    bodyHi: "#FFE07A",
    wing: "#D9A514",
    wingHi: "#FFD45A",
    trim: "#433417",
    cockpit: "rgba(255,250,229,0.92)",
    prop: "#FFF2A0",
    propGlow: "rgba(255,242,160,0.55)",
  },
  "mint-radar": {
    body: "#2FA861",
    bodyHi: "#6AD996",
    wing: "#1F8046",
    wingHi: "#48BF79",
    trim: "#0E2A1B",
    cockpit: "rgba(238,255,244,0.92)",
    prop: "#E8FFC0",
    propGlow: "rgba(232,255,192,0.55)",
  },
  "midnight-courier": {
    body: "#3E7BE0",
    bodyHi: "#78A9FF",
    wing: "#2758AF",
    wingHi: "#4F86F2",
    trim: "#0B122A",
    cockpit: "rgba(233,238,255,0.92)",
    prop: "#9ED0FF",
    propGlow: "rgba(158,208,255,0.55)",
  },
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
  const lineW = Math.max(1.7, 2.05 * Math.sqrt(baseScale)) / s;

  const idleBob = Math.sin(timestamp / 5200 + phase) * 0.35;
  const beaconPulse = 0.55 + 0.45 * Math.sin(timestamp / 1400 + phase * 2);
  const nearBoost = proximity >= 1 ? 1.06 : 1;
  const focusBoost = proximity >= 2 ? 1.08 : 1;
  const highlightBoost = selected || searchOrPointer ? 1.1 : 1;

  ctx.save();
  ctx.translate(sx, sy + idleBob);
  ctx.scale(s, s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const R = 11.8;
  const coreR = 4.7;

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
  ctx.globalAlpha = 0.86 * focusBoost;
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

  const ringR = 4.9 + (proximity >= 1 ? beaconPulse * 0.55 : beaconPulse * 0.3);
  ctx.beginPath();
  ctx.arc(ax, ay - 7, ringR, -Math.PI * 0.85, -Math.PI * 0.15);
  ctx.strokeStyle = colors.beacon;
  ctx.globalAlpha = 0.38 + (proximity >= 2 ? 0.28 : proximity >= 1 ? 0.18 : 0.08) * beaconPulse;
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

type CloudSeed = {
  x: number;
  y: number;
  s: number;
  layer: 0 | 1 | 2;
  drift: number;
};

const CLOUD_SEEDS: CloudSeed[] = [
  { x: 0.08, y: 0.12, s: 0.07, layer: 0, drift: 0.78 },
  { x: 0.18, y: 0.08, s: 0.054, layer: 0, drift: 0.72 },
  { x: 0.28, y: 0.18, s: 0.082, layer: 0, drift: 0.84 },
  { x: 0.42, y: 0.15, s: 0.064, layer: 0, drift: 0.76 },
  { x: 0.58, y: 0.1, s: 0.076, layer: 0, drift: 0.74 },
  { x: 0.84, y: 0.16, s: 0.068, layer: 0, drift: 0.8 },
  { x: 0.14, y: 0.34, s: 0.104, layer: 1, drift: 1 },
  { x: 0.36, y: 0.28, s: 0.094, layer: 1, drift: 0.92 },
  { x: 0.48, y: 0.3, s: 0.118, layer: 1, drift: 1.06 },
  { x: 0.76, y: 0.38, s: 0.1, layer: 1, drift: 0.96 },
  { x: 0.9, y: 0.32, s: 0.088, layer: 1, drift: 1.02 },
  { x: 0.24, y: 0.54, s: 0.132, layer: 2, drift: 1.18 },
  { x: 0.46, y: 0.58, s: 0.118, layer: 2, drift: 1.08 },
  { x: 0.64, y: 0.5, s: 0.122, layer: 2, drift: 1.1 },
  { x: 0.82, y: 0.62, s: 0.116, layer: 2, drift: 1.16 },
];

export const getParallaxCloudCount = (opts?: { layerMin?: number; layerMax?: number }) => {
  const lo = opts?.layerMin ?? 0;
  const hi = opts?.layerMax ?? 2;
  return CLOUD_SEEDS.filter((cloud) => cloud.layer >= lo && cloud.layer <= hi).length;
};

const CLOUD_LAYER_STYLE = {
  0: {
    parallax: 0.008,
    bobAmount: 2.8,
    speed: 0.008,
    alpha: 0.72,
    shadowAlpha: 0.08,
    scale: 0.86,
    outline: "rgba(236, 244, 252, 0.52)",
  },
  1: {
    parallax: 0.014,
    bobAmount: 3.6,
    speed: 0.011,
    alpha: 0.84,
    shadowAlpha: 0.1,
    scale: 1,
    outline: "rgba(228, 239, 250, 0.56)",
  },
  2: {
    parallax: 0.022,
    bobAmount: 4.6,
    speed: 0.014,
    alpha: 0.92,
    shadowAlpha: 0.12,
    scale: 1.12,
    outline: "rgba(225, 238, 250, 0.58)",
  },
} as const;

const buildCloudPuffs = (seed: string): Puff[] => {
  const hash = hashString(seed);
  const spread = 0.04 + (hash % 7) * 0.01;
  const dome = 0.02 + ((hash >>> 3) % 5) * 0.015;
  const loft = 0.018 + ((hash >>> 6) % 6) * 0.012;
  const tail = 0.03 + ((hash >>> 9) % 5) * 0.015;
  return [
    { bx: -0.72 - spread, by: 0.09 + tail * 0.3, br: 0.22 },
    { bx: -0.48 - spread * 0.45, by: -0.02, br: 0.3 },
    { bx: -0.22, by: -0.15 - dome, br: 0.36 },
    { bx: 0.06, by: -0.24 - loft, br: 0.42 },
    { bx: 0.34 + spread * 0.35, by: -0.1 - dome * 0.3, br: 0.34 },
    { bx: 0.6 + spread * 0.8, by: 0.05, br: 0.24 },
    { bx: 0.18, by: 0.14 + tail * 0.2, br: 0.26 },
    { bx: -0.08, by: 0.18 + tail * 0.1, br: 0.24 },
  ];
};

const cloudAtlasCache = new Map<string, HTMLCanvasElement>();

const getCloudAtlas = (
  seed: string,
  layer: keyof typeof CLOUD_LAYER_STYLE,
): HTMLCanvasElement | null => {
  if (typeof document === "undefined") {
    return null;
  }

  const cacheKey = `${layer}:${seed}`;
  const existing = cloudAtlasCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 172;
  const atlas = canvas.getContext("2d");
  if (!atlas) {
    return null;
  }

  const puffs = buildCloudPuffs(seed);
  const style = CLOUD_LAYER_STYLE[layer];
  const noise = hashString(seed);

  atlas.translate(canvas.width / 2, canvas.height / 2);
  atlas.scale(74 * style.scale, 74 * style.scale);
  atlas.globalAlpha = style.alpha;

  atlas.save();
  atlas.translate(0.04, 0.24);
  atlas.scale(1.14, 0.42);
  for (const puff of puffs) {
    atlas.beginPath();
    atlas.arc(puff.bx, puff.by, puff.br, 0, Math.PI * 2);
    const shadow = atlas.createRadialGradient(
      puff.bx,
      puff.by - puff.br * 0.2,
      puff.br * 0.2,
      puff.bx,
      puff.by,
      puff.br * 1.1,
    );
    shadow.addColorStop(0, `rgba(214, 226, 240, ${style.shadowAlpha * 0.22})`);
    shadow.addColorStop(1, `rgba(160, 181, 208, ${style.shadowAlpha})`);
    atlas.fillStyle = shadow;
    atlas.fill();
  }
  atlas.restore();

  const shadow = atlas.createLinearGradient(0, -0.5, 0, 0.7);
  shadow.addColorStop(0, `rgba(214, 226, 240, ${style.shadowAlpha * 0.45})`);
  shadow.addColorStop(1, `rgba(166, 185, 209, ${style.shadowAlpha})`);
  atlas.fillStyle = shadow;

  for (const puff of puffs) {
    atlas.beginPath();
    atlas.arc(puff.bx, puff.by, puff.br, 0, Math.PI * 2);
    const body = atlas.createRadialGradient(
      puff.bx - puff.br * 0.1,
      puff.by - puff.br * 0.4,
      puff.br * 0.12,
      puff.bx,
      puff.by,
      puff.br * 1.12,
    );
    body.addColorStop(0, "rgba(255,255,255,0.98)");
    body.addColorStop(0.55, "rgba(247,252,255,0.96)");
    body.addColorStop(1, "rgba(229,241,250,0.92)");
    atlas.fillStyle = body;
    atlas.fill();
  }

  atlas.lineWidth = 0.04;
  atlas.strokeStyle = style.outline;
  for (const puff of puffs) {
    atlas.beginPath();
    atlas.arc(puff.bx, puff.by, puff.br, 0, Math.PI * 2);
    atlas.stroke();
  }

  atlas.save();
  atlas.globalAlpha = 0.46;
  for (const puff of puffs.slice(1, 6)) {
    atlas.beginPath();
    atlas.arc(puff.bx - 0.05, puff.by - puff.br * 0.35, puff.br * 0.48, 0, Math.PI * 2);
    atlas.fillStyle = "rgba(255,255,255,0.92)";
    atlas.fill();
  }
  atlas.restore();

  atlas.save();
  atlas.globalAlpha = 0.12;
  for (const puff of puffs.slice(0, 5)) {
    atlas.beginPath();
    atlas.arc(puff.bx + 0.08, puff.by + puff.br * 0.22, puff.br * 0.62, 0, Math.PI * 2);
    atlas.fillStyle = "rgba(180, 202, 224, 0.7)";
    atlas.fill();
  }
  atlas.restore();

  atlas.save();
  atlas.globalAlpha = 0.16;
  atlas.fillStyle = "rgba(255,255,255,0.8)";
  for (let index = 0; index < 18; index += 1) {
    const angle = ((noise + index * 53) % 360) * (Math.PI / 180);
    const radius = 0.08 + ((noise + index * 17) % 24) / 120;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * (radius * 0.62);
    atlas.beginPath();
    atlas.arc(px, py, 0.02 + ((noise + index * 11) % 8) / 220, 0, Math.PI * 2);
    atlas.fill();
  }
  atlas.restore();

  cloudAtlasCache.set(cacheKey, canvas);
  return canvas;
};

function drawFluffyCloud(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  seed: string,
  layer: keyof typeof CLOUD_LAYER_STYLE,
) {
  const atlas = getCloudAtlas(seed, layer);
  if (!atlas) {
    return;
  }

  const width = scale * 4.2;
  const height = scale * 2.55;

  ctx.save();
  ctx.globalAlpha = CLOUD_LAYER_STYLE[layer].alpha;
  ctx.drawImage(atlas, cx - width / 2, cy - height / 2, width, height);
  ctx.restore();
}

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

  for (const cloud of CLOUD_SEEDS) {
    if (cloud.layer < lo || cloud.layer > hi) continue;

    const style = CLOUD_LAYER_STYLE[cloud.layer];
    const wrapSpan = width + short * 0.36;
    const travel =
      ((timestamp * style.speed * cloud.drift + camX * style.parallax) % wrapSpan + wrapSpan) %
      wrapSpan;
    const cx = ((cloud.x * wrapSpan - travel + wrapSpan) % wrapSpan) - short * 0.16;
    const cy =
      cloud.y * height +
      Math.sin(timestamp / (4800 - cloud.layer * 380) + cloud.x * 11) * style.bobAmount +
      camY * style.parallax * 0.015;

    drawFluffyCloud(
      ctx,
      cx,
      cy,
      short * cloud.s,
      `${cloud.layer}:${cloud.x}:${cloud.y}:${cloud.s}`,
      cloud.layer,
    );
  }
}

/** Sparse static sparkles — no spin (less visual noise). */
export function drawUpperSparkles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  _timestamp: number,
) {
  ctx.save();
  const topH = height * 0.32;
  for (let i = 0; i < 18; i += 1) {
    const sx = (i * 137 + i * i * 3) % (width - 8) + 4;
    const sy = (i * 79) % topH + 6;
    const tw = 0.28 + (i % 3) * 0.06;
    const a = 0.1 + (i % 5) * 0.028;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(sx - tw, sy - 1, tw * 2, 2);
    ctx.fillRect(sx - 1, sy - tw, 2, tw * 2);
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
  skin: PlaneSkinPalette = planeSkinPalettes.classic,
  scale = 1,
) {
  const prop = (timestamp / 32) % (Math.PI * 2);
  const bob = Math.sin(timestamp / 520) * 0.45;

  ctx.save();
  ctx.translate(snapPixel(cx), snapPixel(cy + bob));
  ctx.rotate(headingRad);
  ctx.rotate(clamp(bankRad, -0.45, 0.45));
  ctx.scale(scale, scale);

  const { body, bodyHi, wing, wingHi, trim, cockpit, prop: propColor, propGlow } = skin;
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
  ctx.fillStyle = cockpit;
  ctx.beginPath();
  ctx.ellipse(6, 0, 7, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Yellow prop hub + motion arcs
  ctx.fillStyle = propColor;
  ctx.beginPath();
  ctx.arc(34, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = propGlow;
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

export function drawFuelCanPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rotation: number,
) {
  ctx.save();
  ctx.translate(snapPixel(x), snapPixel(y));
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "#11203a";

  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
  glow.addColorStop(0, "rgba(255, 107, 99, 0.34)");
  glow.addColorStop(1, "rgba(255, 107, 99, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createLinearGradient(-12, -10, 14, 16);
  body.addColorStop(0, "#ff7e75");
  body.addColorStop(0.55, "#ee433a");
  body.addColorStop(1, "#b5201c");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-11, -14, 22, 28, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 233, 223, 0.86)";
  ctx.beginPath();
  ctx.roundRect(-5, -6, 10, 11, 4);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-5, -14);
  ctx.lineTo(-1, -21);
  ctx.lineTo(8, -21);
  ctx.lineTo(10, -14);
  ctx.closePath();
  ctx.fillStyle = "#ffd867";
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#11203a";
  ctx.beginPath();
  ctx.moveTo(-3, -9);
  ctx.lineTo(3, -9);
  ctx.moveTo(0, -12);
  ctx.lineTo(0, -6);
  ctx.stroke();
  ctx.restore();
}

export function drawSpeedBoostPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rotation: number,
) {
  ctx.save();
  ctx.translate(snapPixel(x), snapPixel(y));
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "#11203a";

  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
  glow.addColorStop(0, "rgba(255, 226, 110, 0.4)");
  glow.addColorStop(1, "rgba(255, 226, 110, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffe36e";
  ctx.beginPath();
  ctx.moveTo(-3, -17);
  ctx.lineTo(10, -4);
  ctx.lineTo(2, -4);
  ctx.lineTo(8, 17);
  ctx.lineTo(-9, 1);
  ctx.lineTo(-1, 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(6, -5);
  ctx.lineTo(1, -5);
  ctx.stroke();
  ctx.restore();
}
