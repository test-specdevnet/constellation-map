import {
  applyCollectibleOutcome,
  collectNearbyCollectibles,
  maintainCollectibles,
} from "./collectibles";
import { GAME_CONFIG } from "./config";

describe("collectibles", () => {
  it("maintains a healthy exploration mix of parachuters and supplies", () => {
    const result = maintainCollectibles({
      collectibles: [],
      bounds: {
        minX: -2_000,
        minY: -2_000,
        maxX: 2_000,
        maxY: 2_000,
        width: 4_000,
        height: 4_000,
      },
      plane: { x: 0, y: 0, heading: 0, speed: 220, angVel: 0 },
      anchorSystems: [{ x: 180, y: 120 }, { x: -240, y: -160 }],
      nowMs: 2_000,
      spawnCounter: 0,
      enableFuel: true,
      enableBoosts: true,
      enableParachuters: true,
      fuelRatio: 0.24,
      boostActive: false,
    });

    expect(result.collectibles.filter((collectible) => collectible.active && collectible.kind === "fuel")).toHaveLength(
      GAME_CONFIG.maxFuelPickups,
    );
    expect(result.collectibles.filter((collectible) => collectible.active && collectible.kind === "boost")).toHaveLength(
      GAME_CONFIG.maxBoostPickups,
    );
    expect(result.collectibles.filter((collectible) => collectible.active && collectible.kind === "parachuter")).toHaveLength(
      GAME_CONFIG.maxParachuters,
    );
  });

  it("collects nearby parachuters, fuel, and boosts in one pass", () => {
    const result = collectNearbyCollectibles({
      collectibles: [
        {
          id: "fuel:1",
          kind: "fuel",
          x: 12,
          y: 10,
          radius: 24,
          value: GAME_CONFIG.fuelPickupAmount,
          bobSeed: 0,
          spinSeed: 0,
          spawnedAtMs: 0,
          respawnAtMs: 0,
          ttlMs: 12_000,
          source: "flight-path",
          active: true,
        },
        {
          id: "boost:1",
          kind: "boost",
          x: 18,
          y: 14,
          radius: 21,
          value: GAME_CONFIG.boostDurationMs,
          bobSeed: 0,
          spinSeed: 0,
          spawnedAtMs: 0,
          respawnAtMs: 0,
          ttlMs: 12_000,
          source: "flight-path",
          active: true,
        },
        {
          id: "parachuter:1",
          kind: "parachuter",
          x: 16,
          y: 8,
          radius: 26,
          value: 1,
          bobSeed: 0,
          spinSeed: 0,
          spawnedAtMs: 0,
          respawnAtMs: 0,
          ttlMs: 12_000,
          source: "near-system",
          active: true,
        },
      ],
      plane: { x: 0, y: 0, heading: 0, speed: 280, angVel: 0 },
      nowMs: 5_000,
    });

    expect(result.fuelDelta).toBe(GAME_CONFIG.fuelPickupAmount);
    expect(result.boostUntilMs).toBe(5_000 + GAME_CONFIG.boostDurationMs);
    expect(result.rescuedCount).toBe(1);
    expect(result.effects.length).toBeGreaterThanOrEqual(4);
    expect(result.collectibles.every((collectible) => !collectible.active)).toBe(true);
  });

  it("applies collection outcomes with rescue and fuel-top-off feedback", () => {
    const applied = applyCollectibleOutcome({
      fuel: 96,
      fuelMax: 100,
      boostUntilMs: 0,
      rescues: 2,
      collectibleResult: {
        fuelDelta: 35,
        boostUntilMs: 0,
        rescuedCount: 1,
      },
      pickupsEnabled: true,
    });

    expect(applied.fuel).toBe(100);
    expect(applied.rescues).toBe(3);
    expect(applied.pickupLabel).toBe("Pilot rescued! · Fuel +4");
  });
});
