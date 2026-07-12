import type { SceneBounds } from "../types/star";
import { updateCombatState, createCombatState } from "./combat";
import { GAME_CONFIG } from "./config";
import type { FlightInputState, FlightState } from "./types";

const bounds: SceneBounds = {
  minX: -2_000,
  minY: -2_000,
  maxX: 2_000,
  maxY: 2_000,
  width: 4_000,
  height: 4_000,
};

const flight = (overrides: Partial<FlightState> = {}): FlightState => ({
  x: 0,
  y: 0,
  heading: 0,
  speed: 300,
  angVel: 0,
  altitude: 0,
  verticalVelocity: 0,
  pitch: 0,
  ...overrides,
});

const input = (overrides: Partial<FlightInputState> = {}): FlightInputState => ({
  accelerate: false,
  brake: false,
  turnLeft: false,
  turnRight: false,
  fire: false,
  mouseTurn: 0,
  moveX: 0,
  moveY: 0,
  climb: false,
  dive: false,
  verticalAxis: 0,
  ...overrides,
});

describe("combat", () => {
  it("spawns bounded green enemy patrol slots by quality mode", () => {
    const combat = createCombatState();

    updateCombatState({
      combat,
      flight: flight(),
      input: input(),
      bounds,
      nowMs: 1_000,
      dtMs: 16,
      qualityMode: "medium",
      enabled: true,
    });

    expect(combat.enemies.filter((enemy) => enemy.active)).toHaveLength(
      GAME_CONFIG.enemyActiveCap.medium,
    );
    expect(combat.projectiles).toHaveLength(0);
  });

  it("fires capped player projectiles from the current heading", () => {
    const combat = createCombatState();

    updateCombatState({
      combat,
      flight: flight({ heading: Math.PI / 2 }),
      input: input({ fire: true }),
      bounds,
      nowMs: 1_000,
      dtMs: 16,
      qualityMode: "low",
      enabled: true,
    });

    expect(combat.shotsFired).toBe(1);
    expect(combat.projectiles[0]?.owner).toBe("player");
    expect(combat.projectiles[0]?.y).toBeGreaterThan(0);
  });

  it("damages and defeats enemies with repeated player hits", () => {
    const combat = createCombatState();
    const enemy = combat.enemies[0];
    enemy.active = true;
    enemy.x = 120;
    enemy.y = 0;
    enemy.heading = Math.PI;
    enemy.speed = 0;
    enemy.health = GAME_CONFIG.playerShotDamage;

    combat.projectiles.push({
      id: "player:shot:test",
      owner: "player",
      x: 100,
      y: 0,
      heading: 0,
      speed: 0,
      radius: 32,
      damage: GAME_CONFIG.playerShotDamage,
      ageMs: 0,
      ttlMs: 1_000,
    });

    const result = updateCombatState({
      combat,
      flight: flight(),
      input: input(),
      bounds,
      nowMs: 2_000,
      dtMs: 16,
      qualityMode: "low",
      enabled: true,
    });

    expect(result.enemiesDefeatedThisTick).toBe(1);
    expect(combat.enemiesDefeated).toBe(1);
    expect(enemy.active).toBe(false);
  });
});
