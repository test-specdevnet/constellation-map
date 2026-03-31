import type { SceneBounds } from "../types/star";
import { GAME_CONFIG, clamp, makeRng, randomBetween } from "./config";
import { createEffect } from "./effects";
import type { Collectible, EnemyPlane, FlightState, PickupKind, VisualEffect } from "./types";

const TWO_PI = Math.PI * 2;

const distance = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const desiredCountByKind: Record<PickupKind, number> = {
  fuel: GAME_CONFIG.maxFuelPickups,
  boost: GAME_CONFIG.maxBoostPickups,
};

const respawnMsByKind: Record<PickupKind, number> = {
  fuel: GAME_CONFIG.fuelPickupRespawnMs,
  boost: GAME_CONFIG.boostPickupRespawnMs,
};

const ttlMsByKind: Record<PickupKind, number> = {
  fuel: GAME_CONFIG.fuelPickupTtlMs,
  boost: GAME_CONFIG.boostPickupTtlMs,
};

const pickupRadiusByKind: Record<PickupKind, number> = {
  fuel: 24,
  boost: 20,
};

const pickupValueByKind: Record<PickupKind, number> = {
  fuel: GAME_CONFIG.fuelPickupAmount,
  boost: GAME_CONFIG.boostDurationMs,
};

const spawnCollectible = ({
  kind,
  bounds,
  plane,
  anchorSystems,
  activeEnemies,
  existingCollectibles,
  nowMs,
  seed,
}: {
  kind: PickupKind;
  bounds: SceneBounds;
  plane: FlightState;
  anchorSystems: Array<{ x: number; y: number }>;
  activeEnemies: EnemyPlane[];
  existingCollectibles: Collectible[];
  nowMs: number;
  seed: string;
}): Collectible | null => {
  const rng = makeRng(seed);
  const radius = pickupRadiusByKind[kind];

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const preferFlightPath = rng() < 0.68 || anchorSystems.length === 0;
    const source = preferFlightPath ? "flight-path" : "near-system";

    let x = plane.x;
    let y = plane.y;

    if (preferFlightPath) {
      const angle = plane.heading + randomBetween(rng, -0.56, 0.56);
      const distanceAhead =
        kind === "fuel"
          ? randomBetween(rng, 440, 920)
          : randomBetween(rng, 520, 980);
      x += Math.cos(angle) * distanceAhead;
      y += Math.sin(angle) * distanceAhead;
    } else {
      const anchor = anchorSystems[Math.floor(rng() * anchorSystems.length)];
      const angle = randomBetween(rng, -Math.PI, Math.PI);
      const offset = kind === "fuel" ? randomBetween(rng, 120, 220) : randomBetween(rng, 160, 260);
      x = anchor.x + Math.cos(angle) * offset;
      y = anchor.y + Math.sin(angle) * offset;
    }

    if (
      x < bounds.minX + 180 ||
      x > bounds.maxX - 180 ||
      y < bounds.minY + 180 ||
      y > bounds.maxY - 180
    ) {
      continue;
    }

    const candidate = { x, y };
    if (anchorSystems.some((anchor) => distance(anchor, candidate) < 120)) {
      continue;
    }
    if (activeEnemies.some((enemy) => distance(enemy, candidate) < 180)) {
      continue;
    }
    if (
      existingCollectibles.some(
        (collectible) =>
          collectible.active &&
          distance(collectible, candidate) < collectible.radius + radius + 120,
      )
    ) {
      continue;
    }

    return {
      id: `${kind}:${seed}`,
      kind,
      x,
      y,
      radius,
      value: pickupValueByKind[kind],
      bobSeed: rng() * TWO_PI,
      spinSeed: rng() * TWO_PI,
      spawnedAtMs: nowMs,
      respawnAtMs: nowMs + respawnMsByKind[kind],
      ttlMs: ttlMsByKind[kind],
      source,
      active: true,
    };
  }

  return null;
};

export const maintainCollectibles = ({
  collectibles,
  bounds,
  plane,
  anchorSystems,
  activeEnemies,
  nowMs,
  spawnCounter,
  enableFuel,
  enableBoosts,
}: {
  collectibles: Collectible[];
  bounds: SceneBounds;
  plane: FlightState;
  anchorSystems: Array<{ x: number; y: number }>;
  activeEnemies: EnemyPlane[];
  nowMs: number;
  spawnCounter: number;
  enableFuel: boolean;
  enableBoosts: boolean;
}) => {
  let nextSpawnCounter = spawnCounter;
  const refreshed = collectibles.map((collectible) =>
    collectible.active && nowMs - collectible.spawnedAtMs >= collectible.ttlMs
      ? {
          ...collectible,
          active: false,
          respawnAtMs: nowMs + respawnMsByKind[collectible.kind],
        }
      : collectible,
  );

  const ensureKind = (kind: PickupKind, enabled: boolean) => {
    if (!enabled) {
      return;
    }

    let activeCount = refreshed.filter(
      (collectible) => collectible.kind === kind && collectible.active,
    ).length;

    for (let index = 0; index < refreshed.length && activeCount < desiredCountByKind[kind]; index += 1) {
      const collectible = refreshed[index];
      if (collectible.kind !== kind || collectible.active || collectible.respawnAtMs > nowMs) {
        continue;
      }

      nextSpawnCounter += 1;
      const respawned = spawnCollectible({
        kind,
        bounds,
        plane,
        anchorSystems,
        activeEnemies,
        existingCollectibles: refreshed,
        nowMs,
        seed: `${kind}:respawn:${nextSpawnCounter}`,
      });

      if (respawned) {
        refreshed[index] = respawned;
        activeCount += 1;
      }
    }

    while (activeCount < desiredCountByKind[kind]) {
      nextSpawnCounter += 1;
      const spawned = spawnCollectible({
        kind,
        bounds,
        plane,
        anchorSystems,
        activeEnemies,
        existingCollectibles: refreshed,
        nowMs,
        seed: `${kind}:spawn:${nextSpawnCounter}`,
      });

      if (!spawned) {
        break;
      }

      refreshed.push(spawned);
      activeCount += 1;
    }
  };

  ensureKind("fuel", enableFuel);
  ensureKind("boost", enableBoosts);

  return {
    collectibles: refreshed,
    spawnCounter: nextSpawnCounter,
  };
};

export const collectNearbyPickups = ({
  collectibles,
  plane,
  nowMs,
}: {
  collectibles: Collectible[];
  plane: FlightState;
  nowMs: number;
}) => {
  let fuelDelta = 0;
  let boostUntilMs = 0;
  const effects: VisualEffect[] = [];

  const nextCollectibles = collectibles.map((collectible) => {
    if (
      !collectible.active ||
      distance(collectible, plane) > GAME_CONFIG.playerPickupRadius + collectible.radius
    ) {
      return collectible;
    }

    if (collectible.kind === "fuel") {
      fuelDelta += collectible.value;
      effects.push(
        createEffect({
          kind: "impact",
          x: collectible.x,
          y: collectible.y,
          ttlMs: 220,
          size: 28,
          color: "rgba(255, 192, 110, 0.92)",
        }),
      );
    } else {
      boostUntilMs = nowMs + collectible.value;
      effects.push(
        createEffect({
          kind: "impact",
          x: collectible.x,
          y: collectible.y,
          ttlMs: 240,
          size: 30,
          color: "rgba(122, 240, 255, 0.92)",
        }),
      );
    }

    return {
      ...collectible,
      active: false,
      respawnAtMs: nowMs + respawnMsByKind[collectible.kind],
    };
  });

  return {
    collectibles: nextCollectibles,
    fuelDelta,
    boostUntilMs,
    effects,
  };
};

export const clampFuel = (fuel: number, fuelMax: number) => clamp(fuel, 0, fuelMax);
