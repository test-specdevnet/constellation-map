import type { SceneBounds } from "../types/star";
import { GAME_CONFIG, clamp, makeRng, randomBetween } from "./config";
import { createEffect } from "./effects";
import type {
  Collectible,
  CollectibleKind,
  FlightState,
  VisualEffect,
} from "./types";

const TWO_PI = Math.PI * 2;
const FUEL_WAYPOINT_OFFSETS = [
  { x: -1, y: 0 },
  { x: -0.72, y: -0.72 },
  { x: -0.72, y: 0.72 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 0.72, y: -0.72 },
  { x: 0.72, y: 0.72 },
  { x: 1, y: 0 },
] as const;

const distance = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const ttlMsByKind: Record<CollectibleKind, number> = {
  fuel: GAME_CONFIG.fuelPickupTtlMs,
  boost: GAME_CONFIG.boostPickupTtlMs,
  parachuter: GAME_CONFIG.parachuterTtlMs,
};

const radiusByKind: Record<CollectibleKind, number> = {
  fuel: 24,
  boost: 21,
  parachuter: 26,
};

const valueByKind: Record<CollectibleKind, number> = {
  fuel: GAME_CONFIG.fuelPickupAmount,
  boost: GAME_CONFIG.boostDurationMs,
  parachuter: 1,
};

const getRespawnMs = ({
  kind,
  fuelRatio,
}: {
  kind: CollectibleKind;
  fuelRatio: number;
}) => {
  if (kind === "fuel") {
    return fuelRatio <= GAME_CONFIG.fuelPickupCriticalThreshold
      ? GAME_CONFIG.fuelPickupCriticalRespawnMs
      : GAME_CONFIG.fuelPickupCruiseRespawnMs;
  }

  return kind === "boost"
    ? GAME_CONFIG.boostPickupRespawnMs
    : GAME_CONFIG.parachuterRespawnMs;
};

const normalizeAngle = (value: number) => {
  let angle = value;
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
};

const isInsideSpawnBounds = (bounds: SceneBounds, point: { x: number; y: number }) =>
  point.x >= bounds.minX + 180 &&
  point.x <= bounds.maxX - 180 &&
  point.y >= bounds.minY + 180 &&
  point.y <= bounds.maxY - 180;

const clampToSpawnBounds = (bounds: SceneBounds, point: { x: number; y: number }) => ({
  x: clamp(point.x, bounds.minX + 180, bounds.maxX - 180),
  y: clamp(point.y, bounds.minY + 180, bounds.maxY - 180),
});

const overlapsActiveCollectible = ({
  candidate,
  radius,
  collectibles,
}: {
  candidate: { x: number; y: number };
  radius: number;
  collectibles: Collectible[];
}) =>
  collectibles.some(
    (collectible) =>
      collectible.active &&
      distance(collectible, candidate) < collectible.radius + radius + 135,
  );

const isOutsideFlightLane = ({
  plane,
  candidate,
}: {
  plane: FlightState;
  candidate: { x: number; y: number };
}) =>
  Math.abs(
    normalizeAngle(Math.atan2(candidate.y - plane.y, candidate.x - plane.x) - plane.heading),
  ) >= GAME_CONFIG.fuelPickupSpawnAvoidanceRadians;

const getDesiredCountByKind = ({
  kind,
  fuelRatio,
  boostActive,
}: {
  kind: CollectibleKind;
  fuelRatio: number;
  boostActive: boolean;
}) => {
  switch (kind) {
    case "fuel":
      return fuelRatio <= GAME_CONFIG.fuelPickupVisibleThreshold ? 1 : 0;
    case "boost":
      return boostActive ? 0 : GAME_CONFIG.boostPickupActiveCap;
    case "parachuter":
      return GAME_CONFIG.maxParachuters;
    default:
      return 0;
  }
};

const spawnCollectible = ({
  kind,
  bounds,
  plane,
  anchorSystems,
  existingCollectibles,
  nowMs,
  fuelRatio,
  seed,
}: {
  kind: CollectibleKind;
  bounds: SceneBounds;
  plane: FlightState;
  anchorSystems: Array<{ x: number; y: number }>;
  existingCollectibles: Collectible[];
  nowMs: number;
  fuelRatio: number;
  seed: string;
}): Collectible | null => {
  const rng = makeRng(seed);
  const radius = radiusByKind[kind];
  const nextRespawnAtMs = nowMs + getRespawnMs({ kind, fuelRatio });

  if (kind === "fuel") {
    const ringDistances =
      fuelRatio <= GAME_CONFIG.fuelPickupCriticalThreshold
        ? [220, 280, 340]
        : [280, 360, 440];
    const waypointCandidates: Array<{
      x: number;
      y: number;
      source: Collectible["source"];
    }> = [];
    const anchors = anchorSystems.length > 0 ? anchorSystems : [{ x: plane.x, y: plane.y }];
    const pushFuelCandidate = ({
      candidate,
      source,
      clampToBounds,
    }: {
      candidate: { x: number; y: number };
      source: Collectible["source"];
      clampToBounds?: boolean;
    }) => {
      const boundedCandidate = clampToBounds
        ? clampToSpawnBounds(bounds, candidate)
        : candidate;
      const planeDistance = distance(plane, boundedCandidate);
      if (
        !isInsideSpawnBounds(bounds, boundedCandidate) ||
        planeDistance < GAME_CONFIG.fuelPickupSpawnMinDistance ||
        planeDistance > GAME_CONFIG.fuelPickupSpawnMaxDistance ||
        !isOutsideFlightLane({ plane, candidate: boundedCandidate }) ||
        overlapsActiveCollectible({
          candidate: boundedCandidate,
          radius,
          collectibles: existingCollectibles,
        })
      ) {
        return;
      }

      waypointCandidates.push({
        ...boundedCandidate,
        source,
      });
    };

    anchors.forEach((anchor, anchorIndex) => {
      FUEL_WAYPOINT_OFFSETS.forEach((offset, offsetIndex) => {
        const ring = ringDistances[(anchorIndex + offsetIndex) % ringDistances.length];
        const jitter = randomBetween(rng, -28, 28);
        pushFuelCandidate({
          candidate: {
            x: anchor.x + offset.x * (ring + jitter),
            y: anchor.y + offset.y * (ring - jitter),
          },
          source: anchorSystems.length > 0 ? "near-system" : "flight-path",
        });
      });
    });

    if (waypointCandidates.length === 0) {
      const fallbackAngles = [
        plane.heading + Math.PI * 0.72,
        plane.heading - Math.PI * 0.72,
        plane.heading + Math.PI,
        plane.heading + Math.PI * 0.52,
        plane.heading - Math.PI * 0.52,
        plane.heading + Math.PI * 0.9,
        plane.heading - Math.PI * 0.9,
      ];
      const fallbackDistances =
        fuelRatio <= GAME_CONFIG.fuelPickupCriticalThreshold
          ? [
              GAME_CONFIG.fuelPickupSpawnMinDistance + 24,
              GAME_CONFIG.fuelPickupSpawnMinDistance + 132,
              GAME_CONFIG.fuelPickupSpawnMinDistance + 260,
            ]
          : [
              GAME_CONFIG.fuelPickupSpawnMinDistance + 80,
              GAME_CONFIG.fuelPickupSpawnMinDistance + 240,
              GAME_CONFIG.fuelPickupSpawnMaxDistance - 120,
            ];

      for (const fallbackAngle of fallbackAngles) {
        for (const fallbackDistance of fallbackDistances) {
          pushFuelCandidate({
            candidate: {
              x: plane.x + Math.cos(fallbackAngle) * fallbackDistance,
              y: plane.y + Math.sin(fallbackAngle) * fallbackDistance,
            },
            source: anchorSystems.length > 0 ? "rescue-lane" : "flight-path",
            clampToBounds: true,
          });
        }
      }
    }

    const fuelWaypoint =
      waypointCandidates[Math.floor(rng() * Math.max(waypointCandidates.length, 1))];

    if (!fuelWaypoint) {
      return null;
    }

    return {
      id: `${kind}:${seed}`,
      kind,
      x: fuelWaypoint.x,
      y: fuelWaypoint.y,
      radius,
      value: valueByKind[kind],
      bobSeed: rng() * TWO_PI,
      spinSeed: rng() * TWO_PI,
      spawnedAtMs: nowMs,
      respawnAtMs: nextRespawnAtMs,
      ttlMs: ttlMsByKind[kind],
      source: fuelWaypoint.source,
      active: true,
    };
  }

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const preferAnchor = anchorSystems.length > 0 && (kind === "parachuter" || rng() < 0.42);
    const source: Collectible["source"] =
      kind === "parachuter" && !preferAnchor ? "rescue-lane" : preferAnchor ? "near-system" : "flight-path";

    let x = plane.x;
    let y = plane.y;

    if (preferAnchor) {
      const anchor = anchorSystems[Math.floor(rng() * anchorSystems.length)];
      const angle = randomBetween(rng, -Math.PI, Math.PI);
      const offset =
        kind === "parachuter"
          ? randomBetween(rng, 140, 260)
          : randomBetween(rng, 210, 340);
      x = anchor.x + Math.cos(angle) * offset;
      y = anchor.y + Math.sin(angle) * offset;
    } else {
      const arc = kind === "boost" ? 0.42 : 0.62;
      const angle = plane.heading + randomBetween(rng, -arc, arc);
      const lateral = randomBetween(rng, -170, 170);
      const distanceAhead =
        kind === "boost" ? randomBetween(rng, 540, 980) : randomBetween(rng, 360, 820);

      x += Math.cos(angle) * distanceAhead + Math.cos(angle + Math.PI / 2) * lateral;
      y += Math.sin(angle) * distanceAhead + Math.sin(angle + Math.PI / 2) * lateral;
    }

    const candidate = { x, y };
    if (!isInsideSpawnBounds(bounds, candidate)) {
      continue;
    }

    if (
      overlapsActiveCollectible({
        candidate,
        radius,
        collectibles: existingCollectibles,
      })
    ) {
      continue;
    }

    if (
      kind !== "parachuter" &&
      anchorSystems.some((anchor) => distance(anchor, candidate) < 110)
    ) {
      continue;
    }

    return {
      id: `${kind}:${seed}`,
      kind,
      x,
      y,
      radius,
      value: valueByKind[kind],
      bobSeed: rng() * TWO_PI,
      spinSeed: rng() * TWO_PI,
      spawnedAtMs: nowMs,
      respawnAtMs: nextRespawnAtMs,
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
  nowMs,
  spawnCounter,
  enableFuel,
  enableBoosts,
  enableParachuters,
  fuelRatio,
  boostActive,
}: {
  collectibles: Collectible[];
  bounds: SceneBounds;
  plane: FlightState;
  anchorSystems: Array<{ x: number; y: number }>;
  nowMs: number;
  spawnCounter: number;
  enableFuel: boolean;
  enableBoosts: boolean;
  enableParachuters: boolean;
  fuelRatio: number;
  boostActive: boolean;
}) => {
  let nextSpawnCounter = spawnCounter;
  let refreshed = collectibles.map((collectible) => {
    const kindEnabled =
      collectible.kind === "fuel"
        ? enableFuel
        : collectible.kind === "boost"
          ? enableBoosts
          : enableParachuters;

    if (!kindEnabled) {
      return { ...collectible, active: false };
    }

    return collectible.active && nowMs - collectible.spawnedAtMs >= collectible.ttlMs
      ? {
          ...collectible,
          active: false,
          respawnAtMs:
            nowMs +
            getRespawnMs({
              kind: collectible.kind,
              fuelRatio,
            }),
        }
      : collectible;
  });

  const fuelCollectibles = refreshed.filter((collectible) => collectible.kind === "fuel");
  if (fuelCollectibles.length > 1) {
    const keepFuelIds = new Set(
      fuelCollectibles
        .slice()
        .sort(
          (left, right) =>
            Number(right.active) - Number(left.active) ||
            left.respawnAtMs - right.respawnAtMs ||
            left.spawnedAtMs - right.spawnedAtMs,
        )
        .slice(0, 1)
        .map((collectible) => collectible.id),
    );
    refreshed = refreshed.filter(
      (collectible) => collectible.kind !== "fuel" || keepFuelIds.has(collectible.id),
    );
  }

  const ensureKind = (kind: CollectibleKind, enabled: boolean) => {
    if (!enabled) {
      return;
    }

    const desiredCount = getDesiredCountByKind({
      kind,
      fuelRatio,
      boostActive,
    });

    let activeCount = refreshed.filter(
      (collectible) => collectible.kind === kind && collectible.active,
    ).length;
    let trackedCount = refreshed.filter((collectible) => collectible.kind === kind).length;
    const forceFuelNow = kind === "fuel" && desiredCount > 0 && activeCount === 0;

    for (let index = 0; index < refreshed.length && activeCount < desiredCount; index += 1) {
      const collectible = refreshed[index];
      if (
        collectible.kind !== kind ||
        collectible.active ||
        (collectible.respawnAtMs > nowMs && !forceFuelNow)
      ) {
        continue;
      }

      nextSpawnCounter += 1;
      const respawned = spawnCollectible({
        kind,
        bounds,
        plane,
        anchorSystems,
        existingCollectibles: refreshed,
        nowMs,
        fuelRatio,
        seed: `${kind}:respawn:${nextSpawnCounter}`,
      });

      if (respawned) {
        refreshed[index] = respawned;
        activeCount += 1;
      }
    }

    while (activeCount < desiredCount && trackedCount < desiredCount) {
      nextSpawnCounter += 1;
      const spawned = spawnCollectible({
        kind,
        bounds,
        plane,
        anchorSystems,
        existingCollectibles: refreshed,
        nowMs,
        fuelRatio,
        seed: `${kind}:spawn:${nextSpawnCounter}`,
      });

      if (!spawned) {
        break;
      }

      refreshed.push(spawned);
      activeCount += 1;
      trackedCount += 1;
    }
  };

  ensureKind("fuel", enableFuel);
  ensureKind("boost", enableBoosts);
  ensureKind("parachuter", enableParachuters);

  return {
    collectibles: refreshed,
    spawnCounter: nextSpawnCounter,
  };
};

export const collectNearbyCollectibles = ({
  collectibles,
  plane,
  nowMs,
  fuelRatio,
}: {
  collectibles: Collectible[];
  plane: FlightState;
  nowMs: number;
  fuelRatio: number;
}) => {
  let fuelDelta = 0;
  let fuelCollectedCount = 0;
  let boostUntilMs = 0;
  let boostCollectedCount = 0;
  let rescuedCount = 0;
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
      fuelCollectedCount += 1;
      effects.push(
        createEffect({
          kind: "pulse",
          x: collectible.x,
          y: collectible.y,
          ttlMs: 260,
          size: 30,
          color: "#ff7470",
        }),
      );
    } else if (collectible.kind === "boost") {
      boostUntilMs = Math.max(boostUntilMs, nowMs + collectible.value);
      boostCollectedCount += 1;
      effects.push(
        createEffect({
          kind: "trail",
          x: collectible.x,
          y: collectible.y,
          ttlMs: 220,
          size: 22,
          color: "#ffe168",
          vx: 0,
          vy: -24,
        }),
        createEffect({
          kind: "pulse",
          x: collectible.x,
          y: collectible.y,
          ttlMs: 240,
          size: 26,
          color: "#ffe168",
        }),
      );
    } else {
      rescuedCount += 1;
      effects.push(
        createEffect({
          kind: "sparkle",
          x: collectible.x,
          y: collectible.y,
          ttlMs: 420,
          size: 34,
          color: "#ffffff",
        }),
        createEffect({
          kind: "trail",
          x: collectible.x,
          y: collectible.y,
          ttlMs: 260,
          size: 24,
          color: "#78e4ff",
          vx: 0,
          vy: -36,
        }),
      );
    }

    return {
      ...collectible,
      active: false,
      respawnAtMs:
        nowMs +
        getRespawnMs({
          kind: collectible.kind,
          fuelRatio,
        }),
    };
  });

  return {
    collectibles: nextCollectibles,
    fuelDelta,
    fuelCollectedCount,
    boostUntilMs,
    boostCollectedCount,
    rescuedCount,
    effects,
  };
};

export const clampFuel = (fuel: number, fuelMax: number) => clamp(fuel, 0, fuelMax);

export const applyCollectibleOutcome = ({
  fuel,
  fuelMax,
  boostUntilMs,
  rescues,
  fuelTanksCollected,
  speedBoostsCollected,
  collectibleResult,
  pickupsEnabled,
}: {
  fuel: number;
  fuelMax: number;
  boostUntilMs: number;
  rescues: number;
  fuelTanksCollected: number;
  speedBoostsCollected: number;
  collectibleResult: {
    fuelDelta: number;
    fuelCollectedCount: number;
    boostUntilMs: number;
    boostCollectedCount: number;
    rescuedCount: number;
  };
  pickupsEnabled: boolean;
}) => {
  const nextFuel = clampFuel(fuel + collectibleResult.fuelDelta, fuelMax);
  const actualFuelDelta = Math.max(0, nextFuel - fuel);
  const nextBoostUntilMs = pickupsEnabled
    ? Math.max(boostUntilMs, collectibleResult.boostUntilMs)
    : 0;
  const nextRescues = rescues + collectibleResult.rescuedCount;
  const nextFuelTanksCollected = fuelTanksCollected + collectibleResult.fuelCollectedCount;
  const nextSpeedBoostsCollected =
    speedBoostsCollected + collectibleResult.boostCollectedCount;
  const notices: string[] = [];

  if (collectibleResult.rescuedCount > 0) {
    notices.push(
      collectibleResult.rescuedCount === 1
        ? "Pilot rescued!"
        : `Pilots rescued +${collectibleResult.rescuedCount}`,
    );
  }

  if (collectibleResult.fuelDelta > 0) {
    notices.push(actualFuelDelta > 0 ? `Fuel +${Math.round(actualFuelDelta)}` : "Fuel topped off");
  }

  if (collectibleResult.boostUntilMs > 0 && pickupsEnabled) {
    notices.push("Boost engaged");
  }

  return {
    fuel: nextFuel,
    boostUntilMs: nextBoostUntilMs,
    rescues: nextRescues,
    fuelTanksCollected: nextFuelTanksCollected,
    speedBoostsCollected: nextSpeedBoostsCollected,
    pickupLabel: notices.join(" | ") || null,
  };
};
