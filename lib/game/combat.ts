import type { SceneBounds } from "../types/star";
import { GAME_CONFIG, clamp, type QualityMode } from "./config";
import type {
  CombatProjectile,
  CombatState,
  EnemyPlane,
  FlightInputState,
  FlightState,
  VisualEffect,
} from "./types";

const TAU = Math.PI * 2;

const normalizeAngle = (angle: number) => {
  let next = angle;
  while (next > Math.PI) next -= TAU;
  while (next < -Math.PI) next += TAU;
  return next;
};

const distanceBetween = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const createEnemySlot = (index: number): EnemyPlane => ({
  id: `enemy:${index}`,
  x: 0,
  y: 0,
  heading: 0,
  speed: 0,
  health: GAME_CONFIG.enemyMaxHealth,
  radius: 58,
  active: false,
  respawnAtMs: 0,
  lastShotAtMs: 0,
  evadeSeed: index * 1.937,
});

export const createCombatState = (): CombatState => ({
  enemies: Array.from({ length: GAME_CONFIG.enemyActiveCap.high }, (_, index) =>
    createEnemySlot(index),
  ),
  projectiles: [],
  playerHealth: GAME_CONFIG.playerMaxHealth,
  playerLastShotAtMs: 0,
  enemiesDefeated: 0,
  shotsFired: 0,
  damageTaken: 0,
  spawnCounter: 0,
});

const spawnEnemy = ({
  enemy,
  flight,
  bounds,
  nowMs,
  slotIndex,
  spawnCounter,
}: {
  enemy: EnemyPlane;
  flight: FlightState;
  bounds: SceneBounds;
  nowMs: number;
  slotIndex: number;
  spawnCounter: number;
}) => {
  const phase = slotIndex * 1.618 + spawnCounter * 0.73;
  const distance =
    GAME_CONFIG.enemySpawnMinDistance +
    ((slotIndex * 137 + spawnCounter * 97) %
      (GAME_CONFIG.enemySpawnMaxDistance - GAME_CONFIG.enemySpawnMinDistance));
  const angle = flight.heading + Math.PI + Math.sin(phase) * 0.9 + slotIndex * 0.42;
  const x = clamp(flight.x + Math.cos(angle) * distance, bounds.minX + 120, bounds.maxX - 120);
  const y = clamp(flight.y + Math.sin(angle) * distance, bounds.minY + 120, bounds.maxY - 120);

  enemy.x = x;
  enemy.y = y;
  enemy.heading = Math.atan2(flight.y - y, flight.x - x);
  enemy.speed = GAME_CONFIG.enemyCruiseSpeed * (0.86 + (slotIndex % 3) * 0.08);
  enemy.health = GAME_CONFIG.enemyMaxHealth;
  enemy.active = true;
  enemy.respawnAtMs = 0;
  enemy.lastShotAtMs = nowMs + slotIndex * 180;
};

const pushEffect = ({
  effects,
  id,
  x,
  y,
  size,
  color,
}: {
  effects: VisualEffect[];
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
}) => {
  effects.push({
    id,
    kind: "pulse",
    x,
    y,
    vx: 0,
    vy: 0,
    ttlMs: 520,
    ageMs: 0,
    size,
    color,
  });
};

const pushProjectile = ({
  combat,
  owner,
  x,
  y,
  heading,
  speed,
  damage,
}: {
  combat: CombatState;
  owner: CombatProjectile["owner"];
  x: number;
  y: number;
  heading: number;
  speed: number;
  damage: number;
}) => {
  combat.projectiles.push({
    id: `${owner}:shot:${combat.spawnCounter}`,
    owner,
    x,
    y,
    heading,
    speed,
    radius: owner === "player" ? 28 : 22,
    damage,
    ageMs: 0,
    ttlMs: GAME_CONFIG.projectileTtlMs,
  });
  combat.spawnCounter += 1;
  if (combat.projectiles.length > GAME_CONFIG.maxProjectiles) {
    combat.projectiles = combat.projectiles.slice(-GAME_CONFIG.maxProjectiles);
  }
};

export const updateCombatState = ({
  combat,
  flight,
  input,
  bounds,
  nowMs,
  dtMs,
  qualityMode,
  enabled,
}: {
  combat: CombatState;
  flight: FlightState;
  input: FlightInputState;
  bounds: SceneBounds;
  nowMs: number;
  dtMs: number;
  qualityMode: QualityMode;
  enabled: boolean;
}) => {
  const effects: VisualEffect[] = [];
  let enemiesDefeatedThisTick = 0;
  let playerDamageThisTick = 0;

  if (!enabled) {
    for (const enemy of combat.enemies) {
      enemy.active = false;
    }
    combat.projectiles = [];
    return { effects, enemiesDefeatedThisTick, playerDamageThisTick };
  }

  const dt = dtMs / 1000;
  const activeCap = GAME_CONFIG.enemyActiveCap[qualityMode];
  const activeEnemies = combat.enemies.filter((enemy) => enemy.active);
  for (const [slotIndex, enemy] of combat.enemies.entries()) {
    if (slotIndex >= activeCap) {
      enemy.active = false;
      continue;
    }
    if (
      activeEnemies.length < activeCap &&
      !enemy.active &&
      nowMs >= enemy.respawnAtMs
    ) {
      spawnEnemy({
        enemy,
        flight,
        bounds,
        nowMs,
        slotIndex,
        spawnCounter: combat.spawnCounter,
      });
      combat.spawnCounter += 1;
      activeEnemies.push(enemy);
    }
  }

  if (input.fire && nowMs - combat.playerLastShotAtMs >= GAME_CONFIG.playerShotCooldownMs) {
    combat.playerLastShotAtMs = nowMs;
    combat.shotsFired += 1;
    pushProjectile({
      combat,
      owner: "player",
      x: flight.x + Math.cos(flight.heading) * 72,
      y: flight.y + Math.sin(flight.heading) * 72,
      heading: flight.heading,
      speed: GAME_CONFIG.projectileSpeed + flight.speed * 0.32,
      damage: GAME_CONFIG.playerShotDamage,
    });
  }

  for (const enemy of combat.enemies) {
    if (!enemy.active) {
      continue;
    }

    const targetHeading = Math.atan2(flight.y - enemy.y, flight.x - enemy.x);
    const range = distanceBetween(enemy, flight);
    const weave = Math.sin(nowMs / 780 + enemy.evadeSeed) * (range < 520 ? 0.72 : 0.34);
    const desiredHeading = targetHeading + weave;
    const turnDelta = normalizeAngle(desiredHeading - enemy.heading);
    enemy.heading += clamp(
      turnDelta,
      -GAME_CONFIG.enemyTurnRate * dt,
      GAME_CONFIG.enemyTurnRate * dt,
    );

    const targetSpeed =
      range > 820
        ? GAME_CONFIG.enemyCruiseSpeed * 1.08
        : range < 300
          ? GAME_CONFIG.enemyCruiseSpeed * 0.68
          : GAME_CONFIG.enemyCruiseSpeed;
    enemy.speed += (targetSpeed - enemy.speed) * Math.min(1, dt * 2.8);
    enemy.x = clamp(enemy.x + Math.cos(enemy.heading) * enemy.speed * dt, bounds.minX, bounds.maxX);
    enemy.y = clamp(enemy.y + Math.sin(enemy.heading) * enemy.speed * dt, bounds.minY, bounds.maxY);

    const aimError = Math.abs(normalizeAngle(targetHeading - enemy.heading));
    const canFire =
      range <= GAME_CONFIG.enemyFireRange &&
      aimError < 0.62 &&
      nowMs - enemy.lastShotAtMs >= GAME_CONFIG.enemyShotCooldownMs;
    if (canFire) {
      enemy.lastShotAtMs = nowMs;
      pushProjectile({
        combat,
        owner: "enemy",
        x: enemy.x + Math.cos(enemy.heading) * 64,
        y: enemy.y + Math.sin(enemy.heading) * 64,
        heading: enemy.heading,
        speed: GAME_CONFIG.projectileSpeed * 0.82 + enemy.speed * 0.2,
        damage: GAME_CONFIG.enemyShotDamage,
      });
    }
  }

  const nextProjectiles: CombatProjectile[] = [];
  for (const projectile of combat.projectiles) {
    projectile.ageMs += dtMs;
    projectile.x += Math.cos(projectile.heading) * projectile.speed * dt;
    projectile.y += Math.sin(projectile.heading) * projectile.speed * dt;

    let consumed = projectile.ageMs >= projectile.ttlMs;
    consumed ||= projectile.x < bounds.minX || projectile.x > bounds.maxX;
    consumed ||= projectile.y < bounds.minY || projectile.y > bounds.maxY;

    if (!consumed && projectile.owner === "player") {
      for (const enemy of combat.enemies) {
        if (!enemy.active) {
          continue;
        }
        if (distanceBetween(projectile, enemy) <= projectile.radius + enemy.radius) {
          enemy.health -= projectile.damage;
          consumed = true;
          pushEffect({
            effects,
            id: `hit:${projectile.id}`,
            x: enemy.x,
            y: enemy.y,
            size: 92,
            color: "#88ffb4",
          });
          if (enemy.health <= 0) {
            enemy.active = false;
            enemy.respawnAtMs = nowMs + GAME_CONFIG.enemyRespawnMs;
            combat.enemiesDefeated += 1;
            enemiesDefeatedThisTick += 1;
            pushEffect({
              effects,
              id: `down:${enemy.id}:${nowMs}`,
              x: enemy.x,
              y: enemy.y,
              size: 180,
              color: "#d7ffd6",
            });
          }
          break;
        }
      }
    }

    if (
      !consumed &&
      projectile.owner === "enemy" &&
      distanceBetween(projectile, flight) <= projectile.radius + 50
    ) {
      consumed = true;
      combat.playerHealth = clamp(
        combat.playerHealth - projectile.damage,
        0,
        GAME_CONFIG.playerMaxHealth,
      );
      combat.damageTaken += projectile.damage;
      playerDamageThisTick += projectile.damage;
      pushEffect({
        effects,
        id: `player-hit:${projectile.id}`,
        x: flight.x,
        y: flight.y,
        size: 110,
        color: "#ff9f7d",
      });
    }

    if (!consumed) {
      nextProjectiles.push(projectile);
    }
  }

  combat.projectiles = nextProjectiles.slice(-GAME_CONFIG.maxProjectiles);
  return { effects, enemiesDefeatedThisTick, playerDamageThisTick };
};
