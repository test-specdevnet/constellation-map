import type { AppSystem, SceneBounds } from "../types/star";

export const FUEL_MAX = 100;
export const FUEL_PICKUP_AMOUNT = 26;
export const BOOST_DURATION_MS = 10_000;
export const DISCOVERY_SCORE = 45;
export const ENEMY_SCORE = 180;

export type PickupKind = "fuel" | "boost";
export type ProjectileOwner = "player" | "enemy";
export type RunState = "flying" | "crashing" | "crashed";

export type FloatingPickup = {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  radius: number;
  value: number;
  bobSeed: number;
  spinSeed: number;
};

export type EnemyPlane = {
  id: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  fireCooldown: number;
  ageMs: number;
  radius: number;
};

export type Projectile = {
  id: string;
  owner: ProjectileOwner;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttlMs: number;
  radius: number;
};

export type GameSessionSnapshot = {
  runId: string;
  fuel: number;
  fuelMax: number;
  boostRemainingMs: number;
  score: number;
  kills: number;
  discoveries: number;
  state: RunState;
  crashReason: string | null;
  durationMs: number;
  enemyCount: number;
  fuelPackCount: number;
  boostPackCount: number;
  leaderboardWeek: string;
};

export type RunRecord = {
  score: number;
  kills: number;
  discoveries: number;
  durationMs: number;
  weekKey: string;
  recordedAt: string;
};

export type LeaderboardEntry = RunRecord & {
  id: string;
  callsign: string;
};

const distance = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const makeRng = (seed: string) => {
  let state = hashString(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

const randomBetween = (rng: () => number, min: number, max: number) => min + (max - min) * rng();

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const getWeeklyLeaderboardKey = (date = new Date()) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + offset);
  return copy.toISOString().slice(0, 10);
};

export const generateRunId = () =>
  `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const generateFloatingPickups = ({
  bounds,
  systems,
  kind,
  count,
  seed,
}: {
  bounds: SceneBounds;
  systems: AppSystem[];
  kind: PickupKind;
  count: number;
  seed: string;
}) => {
  const rng = makeRng(seed);
  const padding = 220;
  const minX = bounds.minX + padding;
  const maxX = bounds.maxX - padding;
  const minY = bounds.minY + padding;
  const maxY = bounds.maxY - padding;
  const minSystemDistance = kind === "fuel" ? 220 : 260;
  const minPickupDistance = kind === "fuel" ? 180 : 210;
  const pickups: FloatingPickup[] = [];

  for (let attempt = 0; attempt < count * 90 && pickups.length < count; attempt += 1) {
    const point = {
      x: randomBetween(rng, minX, maxX),
      y: randomBetween(rng, minY, maxY),
    };

    if (systems.some((system) => distance(system, point) < minSystemDistance)) {
      continue;
    }
    if (pickups.some((pickup) => distance(pickup, point) < minPickupDistance)) {
      continue;
    }

    const radius = kind === "fuel" ? 24 : 20;
    pickups.push({
      id: `${kind}-${pickups.length + 1}`,
      kind,
      x: point.x,
      y: point.y,
      radius,
      value: kind === "fuel" ? FUEL_PICKUP_AMOUNT : BOOST_DURATION_MS,
      bobSeed: rng() * Math.PI * 2,
      spinSeed: rng() * Math.PI * 2,
    });
  }

  return pickups;
};

export const spawnEnemyAtEdge = ({
  bounds,
  plane,
  seed,
}: {
  bounds: SceneBounds;
  plane: { x: number; y: number };
  seed: string;
}): EnemyPlane => {
  const rng = makeRng(seed);
  const edge = Math.floor(rng() * 4);
  const padding = 180;
  let x = plane.x;
  let y = plane.y;

  if (edge === 0) {
    x = bounds.minX + padding;
    y = randomBetween(rng, bounds.minY + padding, bounds.maxY - padding);
  } else if (edge === 1) {
    x = bounds.maxX - padding;
    y = randomBetween(rng, bounds.minY + padding, bounds.maxY - padding);
  } else if (edge === 2) {
    y = bounds.minY + padding;
    x = randomBetween(rng, bounds.minX + padding, bounds.maxX - padding);
  } else {
    y = bounds.maxY - padding;
    x = randomBetween(rng, bounds.minX + padding, bounds.maxX - padding);
  }

  return {
    id: `enemy-${seed}`,
    x,
    y,
    heading: Math.atan2(plane.y - y, plane.x - x),
    speed: randomBetween(rng, 150, 190),
    fireCooldown: randomBetween(rng, 700, 1300),
    ageMs: 0,
    radius: 20,
  };
};

export const makeProjectile = ({
  owner,
  x,
  y,
  heading,
  speed,
}: {
  owner: ProjectileOwner;
  x: number;
  y: number;
  heading: number;
  speed: number;
}): Projectile => ({
  id: `${owner}-shot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  owner,
  x,
  y,
  vx: Math.cos(heading) * speed,
  vy: Math.sin(heading) * speed,
  ttlMs: owner === "player" ? 1_200 : 1_650,
  radius: owner === "player" ? 8 : 9,
});
