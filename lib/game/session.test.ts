import { DEFAULT_FEATURE_FLAGS } from "./config";
import { createGameState, createSessionSnapshot, updateRunResources } from "./session";

describe("session", () => {
  it("only drains fuel while moving and repairs hull after the cooldown", () => {
    const game = createGameState();
    game.runStartedAtMs = 0;
    game.hull = 70;

    updateRunResources({
      game,
      flight: { x: 0, y: 0, heading: 0, speed: 20, angVel: 0 },
      dtMs: 1000,
      nowMs: 1000,
      qualityMode: "high",
      featureFlags: DEFAULT_FEATURE_FLAGS,
    });

    expect(game.fuel).toBe(100);
    expect(game.hull).toBe(70);

    updateRunResources({
      game,
      flight: { x: 0, y: 0, heading: 0, speed: 260, angVel: 0 },
      dtMs: 1000,
      nowMs: 5000,
      qualityMode: "high",
      featureFlags: DEFAULT_FEATURE_FLAGS,
    });

    expect(game.fuel).toBeLessThan(100);
    expect(game.hull).toBeGreaterThan(70);
    expect(game.state).toBe("flying");
  });

  it("captures bounded HUD state including feature flags and minimap entities", () => {
    const game = createGameState();
    game.runStartedAtMs = 0;
    game.boostUntilMs = 7000;
    game.collectibles = [
      {
        id: "fuel:1",
        kind: "fuel",
        x: 30,
        y: 40,
        radius: 24,
        value: 35,
        bobSeed: 0,
        spinSeed: 0,
        spawnedAtMs: 0,
        respawnAtMs: 0,
        ttlMs: 10_000,
        source: "flight-path",
        active: true,
      },
    ];
    game.enemies = [
      {
        id: "enemy:1",
        x: -20,
        y: 12,
        heading: 0,
        speed: 180,
        fireCooldownMs: 0,
        ageMs: 0,
        radius: 20,
        turnRate: 1.2,
      },
    ];

    const snapshot = createSessionSnapshot({
      game,
      nowMs: 1000,
      qualityMode: "medium",
      featureFlags: DEFAULT_FEATURE_FLAGS,
      clusterMarkers: [{ id: "cluster:1", x: 0, y: 0, count: 9 }],
    });

    expect(snapshot.activeBoostLabel).toBe("Speed Boost!");
    expect(snapshot.enemyCount).toBe(1);
    expect(snapshot.flags.enemyPlanes).toBe(true);
    expect(snapshot.miniMap.clusters).toHaveLength(1);
    expect(snapshot.miniMap.powerUps).toHaveLength(1);
  });
});
