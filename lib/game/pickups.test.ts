import { GAME_CONFIG } from "./config";
import { collectNearbyPickups, maintainCollectibles } from "./pickups";

describe("pickups", () => {
  it("spawns bounded fuel cans and boosts away from blocked positions", () => {
    const result = maintainCollectibles({
      collectibles: [],
      bounds: {
        minX: -3000,
        minY: -3000,
        maxX: 3000,
        maxY: 3000,
        width: 6000,
        height: 6000,
      },
      plane: { x: 0, y: 0, heading: Math.PI / 4, speed: 240, angVel: 0 },
      anchorSystems: [{ x: 680, y: 680 }],
      activeEnemies: [
        {
          id: "enemy:blocker",
          x: -540,
          y: -520,
          heading: 0,
          speed: 180,
          fireCooldownMs: 0,
          ageMs: 0,
          radius: 20,
          turnRate: 1.1,
        },
      ],
      nowMs: 10_000,
      spawnCounter: 0,
      enableFuel: true,
      enableBoosts: true,
    });

    const activeFuel = result.collectibles.filter(
      (collectible) => collectible.active && collectible.kind === "fuel",
    );
    const activeBoosts = result.collectibles.filter(
      (collectible) => collectible.active && collectible.kind === "boost",
    );

    expect(activeFuel).toHaveLength(GAME_CONFIG.maxFuelPickups);
    expect(activeBoosts).toHaveLength(GAME_CONFIG.maxBoostPickups);

    for (const collectible of result.collectibles) {
      expect(Math.hypot(collectible.x - 680, collectible.y - 680)).toBeGreaterThan(120);
      expect(Math.hypot(collectible.x + 540, collectible.y + 520)).toBeGreaterThan(180);
    }
  });

  it("collects nearby fuel and speed boosts with deterministic state updates", () => {
    const nowMs = 24_000;
    const result = collectNearbyPickups({
      collectibles: [
        {
          id: "fuel:1",
          kind: "fuel",
          x: 0,
          y: 0,
          radius: 24,
          value: GAME_CONFIG.fuelPickupAmount,
          bobSeed: 0,
          spinSeed: 0,
          spawnedAtMs: 0,
          respawnAtMs: 0,
          ttlMs: 10_000,
          source: "flight-path",
          active: true,
        },
        {
          id: "boost:1",
          kind: "boost",
          x: 12,
          y: 4,
          radius: 20,
          value: GAME_CONFIG.boostDurationMs,
          bobSeed: 0,
          spinSeed: 0,
          spawnedAtMs: 0,
          respawnAtMs: 0,
          ttlMs: 10_000,
          source: "near-system",
          active: true,
        },
      ],
      plane: { x: 0, y: 0, heading: 0, speed: 300, angVel: 0 },
      nowMs,
    });

    expect(result.fuelDelta).toBe(GAME_CONFIG.fuelPickupAmount);
    expect(result.boostUntilMs).toBe(nowMs + GAME_CONFIG.boostDurationMs);
    expect(result.collectibles.every((collectible) => !collectible.active)).toBe(true);
    expect(result.effects).toHaveLength(2);
  });
});
