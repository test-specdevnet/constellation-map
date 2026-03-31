import type { SceneBounds } from "../types/star";
import {
  GAME_CONFIG,
  clamp,
  getEnemyCap,
  getEnemySpawnDelayMs,
  makeRng,
  randomBetween,
  type EnemyDensitySetting,
  type QualityMode,
} from "./config";
import { createEffect } from "./effects";
import type {
  EnemyPlane,
  FlightState,
  Projectile,
  ProjectileOwner,
  VisualEffect,
} from "./types";

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;

const distance = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const angleDelta = (target: number, current: number) => {
  let delta = target - current;
  while (delta > Math.PI) delta -= TWO_PI;
  while (delta < -Math.PI) delta += TWO_PI;
  return delta;
};

const clampAngle = (angle: number) => {
  let nextAngle = angle;
  while (nextAngle > Math.PI) nextAngle -= TWO_PI;
  while (nextAngle < -Math.PI) nextAngle += TWO_PI;
  return nextAngle;
};

const polarPoint = (origin: { x: number; y: number }, angle: number, length: number) => ({
  x: origin.x + Math.cos(angle) * length,
  y: origin.y + Math.sin(angle) * length,
});

const segmentHitsCircle = ({
  start,
  end,
  center,
  radius,
}: {
  start: { x: number; y: number };
  end: { x: number; y: number };
  center: { x: number; y: number };
  radius: number;
}) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) {
    return distance(start, center) <= radius;
  }

  const projection = clamp(
    ((center.x - start.x) * dx + (center.y - start.y) * dy) / lengthSq,
    0,
    1,
  );
  const closest = {
    x: start.x + dx * projection,
    y: start.y + dy * projection,
  };
  return distance(closest, center) <= radius;
};

const getViewportExitDistance = ({
  origin,
  angle,
  viewport,
  padding = 140,
}: {
  origin: { x: number; y: number };
  angle: number;
  viewport: SceneBounds;
  padding?: number;
}) => {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const distances: number[] = [];

  if (dx > 0.0001) {
    distances.push((viewport.maxX + padding - origin.x) / dx);
  } else if (dx < -0.0001) {
    distances.push((viewport.minX - padding - origin.x) / dx);
  }

  if (dy > 0.0001) {
    distances.push((viewport.maxY + padding - origin.y) / dy);
  } else if (dy < -0.0001) {
    distances.push((viewport.minY - padding - origin.y) / dy);
  }

  const exitDistance = distances
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)[0];

  return Number.isFinite(exitDistance) ? exitDistance : null;
};

export const createProjectile = ({
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
  prevX: x,
  prevY: y,
  x,
  y,
  vx: Math.cos(heading) * speed,
  vy: Math.sin(heading) * speed,
  ttlMs:
    owner === "player"
      ? GAME_CONFIG.playerProjectileTtlMs
      : GAME_CONFIG.enemyProjectileTtlMs,
  radius: owner === "player" ? 8 : 9,
  damage:
    owner === "player" ? GAME_CONFIG.hullMax : GAME_CONFIG.enemyProjectileDamage,
  heading,
});

export const spawnEnemyPlane = ({
  bounds,
  plane,
  viewport,
  nowMs,
  seed,
  elapsedMs,
  score,
  qualityMode,
}: {
  bounds: SceneBounds;
  plane: FlightState;
  viewport: SceneBounds;
  nowMs: number;
  seed: string;
  elapsedMs: number;
  score: number;
  qualityMode: QualityMode;
}): EnemyPlane | null => {
  const rng = makeRng(seed);
  const exclusion = (GAME_CONFIG.enemySpawnConeDegrees / 2) * DEG_TO_RAD;
  const padding = 220;
  const difficultyScale = 1 + clamp(elapsedMs / 240_000 + score / 12_000, 0, 0.45);

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const side = rng() > 0.5 ? 1 : -1;
    const offsetMagnitude = exclusion + randomBetween(rng, 0.2, Math.PI - exclusion);
    const angle = clampAngle(plane.heading + side * offsetMagnitude);
    const viewportExitDistance = getViewportExitDistance({
      origin: plane,
      angle,
      viewport,
    });

    if (viewportExitDistance === null) {
      continue;
    }

    const minSpawnDistance = Math.max(
      GAME_CONFIG.enemySpawnDistanceMin,
      viewportExitDistance,
    );
    if (minSpawnDistance > GAME_CONFIG.enemySpawnDistanceMax) {
      continue;
    }

    const distanceToPlayer = randomBetween(
      rng,
      minSpawnDistance,
      GAME_CONFIG.enemySpawnDistanceMax,
    );
    const candidate = polarPoint(plane, angle, distanceToPlayer);

    if (
      candidate.x < bounds.minX + padding ||
      candidate.x > bounds.maxX - padding ||
      candidate.y < bounds.minY + padding ||
      candidate.y > bounds.maxY - padding
    ) {
      continue;
    }

    const targetHeading = Math.atan2(plane.y - candidate.y, plane.x - candidate.x);
    return {
      id: `enemy:${nowMs}:${seed}`,
      x: candidate.x,
      y: candidate.y,
      heading: targetHeading,
      speed:
        randomBetween(rng, 170, 220) *
        difficultyScale *
        (qualityMode === "low" ? 0.92 : qualityMode === "high" ? 1.05 : 1),
      fireCooldownMs: randomBetween(rng, 650, 1_050),
      ageMs: 0,
      radius: 20,
      turnRate: randomBetween(rng, 1.1, 1.5),
    };
  }

  return null;
};

export const updateEnemies = ({
  enemies,
  plane,
  dtMs,
  nowMs,
}: {
  enemies: EnemyPlane[];
  plane: FlightState;
  dtMs: number;
  nowMs: number;
}) => {
  const dt = dtMs / 1000;
  const nextEnemies: EnemyPlane[] = [];
  const spawnedProjectiles: Projectile[] = [];
  const effects: VisualEffect[] = [];
  const removedEnemyIds = new Set<string>();

  for (const enemy of enemies) {
    const nextEnemy = { ...enemy };
    nextEnemy.ageMs += dtMs;
    nextEnemy.fireCooldownMs -= dtMs;

    const playerVelocity = {
      x: Math.cos(plane.heading) * plane.speed,
      y: Math.sin(plane.heading) * plane.speed,
    };
    const distanceToPlayer = distance(nextEnemy, plane);
    const leadTime = clamp(distanceToPlayer / Math.max(nextEnemy.speed * 2.2, 1), 0.18, 1.1);
    const predictedTarget = {
      x: plane.x + playerVelocity.x * leadTime,
      y: plane.y + playerVelocity.y * leadTime,
    };
    const desiredHeading = Math.atan2(
      predictedTarget.y - nextEnemy.y,
      predictedTarget.x - nextEnemy.x,
    );
    const delta = angleDelta(desiredHeading, nextEnemy.heading);

    nextEnemy.heading += clamp(delta, -nextEnemy.turnRate * dt, nextEnemy.turnRate * dt);
    nextEnemy.x += Math.cos(nextEnemy.heading) * nextEnemy.speed * dt;
    nextEnemy.y += Math.sin(nextEnemy.heading) * nextEnemy.speed * dt;

    if (
      nextEnemy.fireCooldownMs <= 0 &&
      distanceToPlayer <= GAME_CONFIG.enemyFireRange &&
      Math.abs(delta) <= GAME_CONFIG.enemyAimWindowDegrees * DEG_TO_RAD
    ) {
      spawnedProjectiles.push(
        createProjectile({
          owner: "enemy",
          x: nextEnemy.x + Math.cos(nextEnemy.heading) * 42,
          y: nextEnemy.y + Math.sin(nextEnemy.heading) * 42,
          heading: desiredHeading,
          speed: GAME_CONFIG.enemyProjectileSpeed,
        }),
      );
      effects.push(
        createEffect({
          kind: "muzzle",
          x: nextEnemy.x + Math.cos(nextEnemy.heading) * 32,
          y: nextEnemy.y + Math.sin(nextEnemy.heading) * 32,
          ttlMs: 180,
          size: 18,
          color: "rgba(255, 186, 108, 0.95)",
        }),
      );
      nextEnemy.fireCooldownMs = 900 + ((nowMs + nextEnemy.ageMs) % 180);
    }

    if (
      nextEnemy.ageMs > GAME_CONFIG.enemyMaxAgeMs ||
      distance(nextEnemy, plane) > GAME_CONFIG.enemyDespawnDistance
    ) {
      removedEnemyIds.add(nextEnemy.id);
      continue;
    }

    nextEnemies.push(nextEnemy);
  }

  return {
    enemies: nextEnemies,
    spawnedProjectiles,
    effects,
    removedEnemyIds,
  };
};

export const updateProjectiles = ({
  projectiles,
  enemies,
  plane,
  dtMs,
}: {
  projectiles: Projectile[];
  enemies: EnemyPlane[];
  plane: FlightState;
  dtMs: number;
}) => {
  const dt = dtMs / 1000;
  const nextProjectiles: Projectile[] = [];
  const destroyedEnemyIds = new Set<string>();
  const effects: VisualEffect[] = [];
  let playerHullDamage = 0;

  for (const projectile of projectiles) {
    const nextProjectile = {
      ...projectile,
      prevX: projectile.x,
      prevY: projectile.y,
      x: projectile.x + projectile.vx * dt,
      y: projectile.y + projectile.vy * dt,
      ttlMs: projectile.ttlMs - dtMs,
    };

    if (nextProjectile.ttlMs <= 0) {
      continue;
    }

    effects.push(
      createEffect({
        kind: "tracer",
        x: nextProjectile.x,
        y: nextProjectile.y,
        ttlMs: 140,
        size: projectile.owner === "player" ? 12 : 14,
        color:
          projectile.owner === "player"
            ? "rgba(255, 243, 174, 0.92)"
            : "rgba(255, 122, 122, 0.92)",
        vx: projectile.vx * 0.04,
        vy: projectile.vy * 0.04,
      }),
    );

    if (projectile.owner === "player") {
      const hitEnemy = enemies.find(
        (enemy) =>
          !destroyedEnemyIds.has(enemy.id) &&
          segmentHitsCircle({
            start: { x: nextProjectile.prevX, y: nextProjectile.prevY },
            end: { x: nextProjectile.x, y: nextProjectile.y },
            center: enemy,
            radius: enemy.radius + nextProjectile.radius,
          }),
      );

      if (hitEnemy) {
        destroyedEnemyIds.add(hitEnemy.id);
        effects.push(
          createEffect({
            kind: "impact",
            x: hitEnemy.x,
            y: hitEnemy.y,
            ttlMs: 220,
            size: 20,
            color: "rgba(255, 245, 169, 0.92)",
          }),
          createEffect({
            kind: "explosion",
            x: hitEnemy.x,
            y: hitEnemy.y,
            ttlMs: 680,
            size: 44,
            color: "rgba(255, 156, 84, 0.88)",
          }),
        );
        continue;
      }
    } else if (
      segmentHitsCircle({
        start: { x: nextProjectile.prevX, y: nextProjectile.prevY },
        end: { x: nextProjectile.x, y: nextProjectile.y },
        center: plane,
        radius: GAME_CONFIG.playerCollisionRadius + nextProjectile.radius,
      })
    ) {
      playerHullDamage += nextProjectile.damage;
      effects.push(
        createEffect({
          kind: "impact",
          x: nextProjectile.x,
          y: nextProjectile.y,
          ttlMs: 180,
          size: 18,
          color: "rgba(255, 124, 124, 0.92)",
        }),
      );
      continue;
    }

    nextProjectiles.push(nextProjectile);
  }

  return {
    projectiles: nextProjectiles,
    destroyedEnemyIds,
    playerHullDamage,
    effects,
  };
};

export const resolveEnemyPlaneCollisions = ({
  enemies,
  plane,
}: {
  enemies: EnemyPlane[];
  plane: FlightState;
}) => {
  const destroyedEnemyIds = new Set<string>();
  const effects: VisualEffect[] = [];
  let playerHullDamage = 0;

  for (const enemy of enemies) {
    if (
      distance(enemy, plane) <=
      enemy.radius + GAME_CONFIG.playerCollisionRadius + 2
    ) {
      playerHullDamage += GAME_CONFIG.collisionDamage;
      destroyedEnemyIds.add(enemy.id);
      effects.push(
        createEffect({
          kind: "explosion",
          x: enemy.x,
          y: enemy.y,
          ttlMs: 760,
          size: 56,
          color: "rgba(255, 130, 88, 0.94)",
        }),
      );
    }
  }

  return {
    destroyedEnemyIds,
    playerHullDamage,
    effects,
  };
};

export const scheduleNextEnemySpawn = ({
  nowMs,
  elapsedMs,
  score,
  qualityMode,
  spawnCounter,
}: {
  nowMs: number;
  elapsedMs: number;
  score: number;
  qualityMode: QualityMode;
  spawnCounter: number;
}) =>
  nowMs +
  getEnemySpawnDelayMs({
    elapsedMs,
    score,
    qualityMode,
    seed: `enemy-delay:${spawnCounter}:${score}`,
  });

export const advanceEnemySpawner = ({
  enabled,
  enemies,
  bounds,
  plane,
  viewport,
  nowMs,
  runStartedAtMs,
  nextEnemySpawnAtMs,
  spawnCounter,
  score,
  qualityMode,
  enemyDensity,
}: {
  enabled: boolean;
  enemies: EnemyPlane[];
  bounds: SceneBounds;
  plane: FlightState;
  viewport: SceneBounds;
  nowMs: number;
  runStartedAtMs: number;
  nextEnemySpawnAtMs: number;
  spawnCounter: number;
  score: number;
  qualityMode: QualityMode;
  enemyDensity: EnemyDensitySetting;
}) => {
  if (!enabled) {
    return {
      enemies: [] as EnemyPlane[],
      nextEnemySpawnAtMs: 0,
      spawnCounter,
      targetActiveEnemies: 0,
    };
  }

  const elapsedMs = Math.max(0, nowMs - runStartedAtMs);
  const targetActiveEnemies = getEnemyCap({
    elapsedMs,
    score,
    qualityMode,
    enemyDensity,
  });

  let nextSpawnCounter = spawnCounter;
  let nextSpawnAtMs = nextEnemySpawnAtMs;
  const nextEnemies = [...enemies];

  if (nextSpawnAtMs === 0) {
    nextSpawnAtMs =
      runStartedAtMs +
      Math.min(
        GAME_CONFIG.initialEnemySpawnMaxMs,
        getEnemySpawnDelayMs({
          elapsedMs: 0,
          score: 0,
          qualityMode,
          seed: `initial:${Math.round(plane.x)}:${Math.round(plane.y)}`,
        }),
      );
  }

  if (nowMs >= nextSpawnAtMs && nextEnemies.length < targetActiveEnemies) {
    nextSpawnCounter += 1;
    const spawnedEnemy = spawnEnemyPlane({
      bounds,
      plane,
      viewport,
      nowMs,
      seed: `enemy:${nextSpawnCounter}:${Math.round(nowMs)}`,
      elapsedMs,
      score,
      qualityMode,
    });

    if (spawnedEnemy) {
      nextEnemies.push(spawnedEnemy);
    }

    nextSpawnAtMs = scheduleNextEnemySpawn({
      nowMs,
      elapsedMs,
      score,
      qualityMode,
      spawnCounter: nextSpawnCounter,
    });
  }

  return {
    enemies: nextEnemies,
    nextEnemySpawnAtMs: nextSpawnAtMs,
    spawnCounter: nextSpawnCounter,
    targetActiveEnemies,
  };
};
