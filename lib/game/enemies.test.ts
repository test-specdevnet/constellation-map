import { GAME_CONFIG } from "./config";
import { spawnEnemyPlane, updateProjectiles } from "./enemies";
import { computeViewportWorldBounds } from "./flightController";

const angleDelta = (target: number, current: number) => {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
};

describe("enemies", () => {
  it("spawns enemy aircraft outside the view and outside the forward cone", () => {
    const plane = { x: 0, y: 0, heading: -Math.PI / 2, speed: 420, angVel: 0 };
    const viewport = computeViewportWorldBounds({
      camera: { x: 0, y: 0, zoom: 0.24 },
      canvasSize: { width: 1200, height: 760 },
    });

    const enemy = spawnEnemyPlane({
      bounds: {
        minX: -4000,
        minY: -4000,
        maxX: 4000,
        maxY: 4000,
        width: 8000,
        height: 8000,
      },
      plane,
      viewport,
      nowMs: 4000,
      seed: "enemy-test",
      elapsedMs: 10_000,
      score: 0,
      qualityMode: "high",
    });

    expect(enemy).not.toBeNull();
    expect(
      enemy !== null &&
        (enemy.x < viewport.minX ||
          enemy.x > viewport.maxX ||
          enemy.y < viewport.minY ||
          enemy.y > viewport.maxY),
    ).toBe(true);

    if (enemy) {
      const spawnAngle = Math.atan2(enemy.y - plane.y, enemy.x - plane.x);
      expect(angleDelta(spawnAngle, plane.heading)).toBeGreaterThanOrEqual(
        (GAME_CONFIG.enemySpawnConeDegrees / 2) * (Math.PI / 180),
      );
    }
  });

  it("destroys enemies on player hits and damages the player on enemy hits", () => {
    const result = updateProjectiles({
      projectiles: [
        {
          id: "player-shot",
          owner: "player",
          x: 92,
          y: 0,
          vx: 0,
          vy: 0,
          ttlMs: 100,
          radius: 8,
          damage: GAME_CONFIG.hullMax,
          heading: 0,
        },
        {
          id: "enemy-shot",
          owner: "enemy",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          ttlMs: 100,
          radius: 9,
          damage: GAME_CONFIG.enemyProjectileDamage,
          heading: 0,
        },
      ],
      enemies: [
        {
          id: "enemy-1",
          x: 100,
          y: 0,
          heading: 0,
          speed: 160,
          fireCooldownMs: 0,
          ageMs: 0,
          radius: 20,
          turnRate: 1.2,
        },
      ],
      plane: { x: 0, y: 0, heading: 0, speed: 0, angVel: 0 },
      dtMs: 16,
    });

    expect(result.destroyedEnemyIds.has("enemy-1")).toBe(true);
    expect(result.playerHullDamage).toBe(GAME_CONFIG.enemyProjectileDamage);
    expect(result.effects.length).toBeGreaterThan(0);
  });
});
