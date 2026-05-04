import {
  applyCollectibleOutcome,
  collectNearbyCollectibles,
  maintainCollectibles,
} from "./collectibles";
import { DEFAULT_FEATURE_FLAGS, GAME_CONFIG } from "./config";
import type { Collectible, FlightState } from "./types";

const normalizeAngle = (value: number) => {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

const bounds = {
  minX: -2_000,
  minY: -2_000,
  maxX: 2_000,
  maxY: 2_000,
  width: 4_000,
  height: 4_000,
};

const plane: FlightState = { x: 0, y: 0, heading: 0, speed: 220, angVel: 0 };

const fuelCollectible = (overrides: Partial<Collectible> = {}): Collectible => ({
  id: "fuel:existing",
  kind: "fuel",
  x: 120,
  y: 60,
  radius: 24,
  value: GAME_CONFIG.fuelPickupAmount,
  bobSeed: 0,
  spinSeed: 0,
  spawnedAtMs: 0,
  respawnAtMs: 0,
  ttlMs: GAME_CONFIG.fuelPickupTtlMs,
  source: "flight-path",
  active: false,
  ...overrides,
});

const activeFuelCollectibles = (collectibles: Collectible[]) =>
  collectibles.filter((collectible) => collectible.active && collectible.kind === "fuel");

describe("collectibles", () => {
  it("enables fuel and pickups by default", () => {
    expect(DEFAULT_FEATURE_FLAGS.fuelSystem).toBe(true);
    expect(DEFAULT_FEATURE_FLAGS.pickups).toBe(true);
  });

  it("spawns a single fair fuel pickup when reserves dip", () => {
    const result = maintainCollectibles({
      collectibles: [],
      bounds,
      plane,
      anchorSystems: [{ x: 180, y: 120 }, { x: -240, y: -160 }],
      nowMs: 2_000,
      spawnCounter: 0,
      enableFuel: true,
      enableBoosts: true,
      enableParachuters: true,
      fuelRatio: 0.24,
      boostActive: false,
    });
    const activeFuel = result.collectibles.find(
      (collectible) => collectible.active && collectible.kind === "fuel",
    );

    expect(activeFuel).toBeDefined();
    expect(activeFuel?.source).toBe("near-system");
    expect(
      Math.abs(
        normalizeAngle(
          Math.atan2((activeFuel?.y ?? 0) - plane.y, (activeFuel?.x ?? 0) - plane.x) -
            plane.heading,
        ),
      ),
    ).toBeGreaterThanOrEqual(GAME_CONFIG.fuelPickupSpawnAvoidanceRadians);
    expect(
      result.collectibles.filter(
        (collectible) => collectible.active && collectible.kind === "boost",
      ),
    ).toHaveLength(GAME_CONFIG.boostPickupActiveCap);
    expect(
      result.collectibles.filter(
        (collectible) => collectible.active && collectible.kind === "parachuter",
      ),
    ).toHaveLength(GAME_CONFIG.maxParachuters);
  });

  it("spawns low-fuel pickups from a deterministic plane lane without anchor systems", () => {
    const result = maintainCollectibles({
      collectibles: [],
      bounds,
      plane,
      anchorSystems: [],
      nowMs: 2_000,
      spawnCounter: 0,
      enableFuel: true,
      enableBoosts: false,
      enableParachuters: false,
      fuelRatio: 0.62,
      boostActive: false,
    });
    const activeFuel = activeFuelCollectibles(result.collectibles);
    const fuel = activeFuel[0];
    const fuelDistance = fuel ? Math.hypot(fuel.x - plane.x, fuel.y - plane.y) : 0;

    expect(activeFuel).toHaveLength(1);
    expect(fuel?.source).toBe("flight-path");
    expect(fuel?.x).toBeGreaterThanOrEqual(bounds.minX + 180);
    expect(fuel?.x).toBeLessThanOrEqual(bounds.maxX - 180);
    expect(fuel?.y).toBeGreaterThanOrEqual(bounds.minY + 180);
    expect(fuel?.y).toBeLessThanOrEqual(bounds.maxY - 180);
    expect(fuelDistance).toBeGreaterThanOrEqual(GAME_CONFIG.fuelPickupSpawnMinDistance);
    expect(fuelDistance).toBeLessThanOrEqual(GAME_CONFIG.fuelPickupSpawnMaxDistance);
    expect(
      Math.abs(normalizeAngle(Math.atan2((fuel?.y ?? 0) - plane.y, (fuel?.x ?? 0) - plane.x) - plane.heading)),
    ).toBeGreaterThanOrEqual(GAME_CONFIG.fuelPickupSpawnAvoidanceRadians);
  });

  it("waits to surface fuel until the reserve actually drops", () => {
    const result = maintainCollectibles({
      collectibles: [],
      bounds,
      plane,
      anchorSystems: [{ x: 180, y: 120 }, { x: -240, y: -160 }],
      nowMs: 2_000,
      spawnCounter: 0,
      enableFuel: true,
      enableBoosts: true,
      enableParachuters: true,
      fuelRatio: 0.92,
      boostActive: false,
    });

    expect(
      result.collectibles.filter((collectible) => collectible.active && collectible.kind === "fuel"),
    ).toHaveLength(0);
  });

  it("keeps fuel inactive when the fuel system is disabled", () => {
    const result = maintainCollectibles({
      collectibles: [fuelCollectible({ active: true })],
      bounds,
      plane,
      anchorSystems: [],
      nowMs: 2_000,
      spawnCounter: 0,
      enableFuel: false,
      enableBoosts: false,
      enableParachuters: false,
      fuelRatio: 0.18,
      boostActive: false,
    });

    expect(activeFuelCollectibles(result.collectibles)).toHaveLength(0);
    expect(result.collectibles.filter((collectible) => collectible.kind === "fuel")).toHaveLength(1);
  });

  it("forces a visible fuel respawn after pickup cooldown when reserves are low", () => {
    const result = maintainCollectibles({
      collectibles: [
        fuelCollectible({
          id: "fuel:picked-up",
          active: false,
          respawnAtMs: 30_000,
        }),
      ],
      bounds,
      plane,
      anchorSystems: [],
      nowMs: 3_000,
      spawnCounter: 7,
      enableFuel: true,
      enableBoosts: false,
      enableParachuters: false,
      fuelRatio: 0.52,
      boostActive: false,
    });
    const activeFuel = activeFuelCollectibles(result.collectibles);

    expect(activeFuel).toHaveLength(1);
    expect(activeFuel[0]?.id).not.toBe("fuel:picked-up");
    expect(result.collectibles.filter((collectible) => collectible.kind === "fuel")).toHaveLength(1);
  });

  it("respawns expired fuel immediately when reserves are critical", () => {
    const result = maintainCollectibles({
      collectibles: [
        fuelCollectible({
          id: "fuel:expired",
          active: true,
          spawnedAtMs: 0,
          ttlMs: 1_000,
        }),
      ],
      bounds,
      plane,
      anchorSystems: [],
      nowMs: 2_000,
      spawnCounter: 2,
      enableFuel: true,
      enableBoosts: false,
      enableParachuters: false,
      fuelRatio: 0.16,
      boostActive: false,
    });
    const activeFuel = activeFuelCollectibles(result.collectibles);

    expect(activeFuel).toHaveLength(1);
    expect(activeFuel[0]?.id).not.toBe("fuel:expired");
    expect(activeFuel[0]?.spawnedAtMs).toBe(2_000);
    expect(activeFuel[0]?.respawnAtMs).toBe(2_000 + GAME_CONFIG.fuelPickupCriticalRespawnMs);
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
      fuelRatio: 0.24,
    });

    expect(result.fuelDelta).toBe(GAME_CONFIG.fuelPickupAmount);
    expect(result.fuelCollectedCount).toBe(1);
    expect(result.boostUntilMs).toBe(5_000 + GAME_CONFIG.boostDurationMs);
    expect(result.boostCollectedCount).toBe(1);
    expect(result.rescuedCount).toBe(1);
    expect(result.effects.length).toBeGreaterThanOrEqual(4);
    expect(result.collectibles.every((collectible) => !collectible.active)).toBe(true);
  });

  it("does not queue extra hidden fuel cans while one is already cooling down", () => {
    const result = maintainCollectibles({
      collectibles: [
        fuelCollectible({
          id: "fuel:active",
          x: 120,
          y: 60,
          active: true,
        }),
        fuelCollectible({
          id: "fuel:cooldown",
          x: 220,
          y: 90,
          respawnAtMs: 10_000,
          source: "flight-path",
          active: false,
        }),
      ],
      bounds,
      plane,
      anchorSystems: [{ x: 180, y: 120 }, { x: -240, y: -160 }],
      nowMs: 2_000,
      spawnCounter: 0,
      enableFuel: true,
      enableBoosts: true,
      enableParachuters: true,
      fuelRatio: 0.18,
      boostActive: false,
    });

    expect(
      result.collectibles.filter((collectible) => collectible.kind === "fuel" && collectible.active),
    ).toHaveLength(1);
    expect(result.collectibles.filter((collectible) => collectible.kind === "fuel")).toHaveLength(1);
  });

  it("applies collection outcomes with rescue and fuel-top-off feedback", () => {
    const applied = applyCollectibleOutcome({
      fuel: 96,
      fuelMax: 100,
      boostUntilMs: 0,
      rescues: 2,
      fuelTanksCollected: 1,
      speedBoostsCollected: 0,
      collectibleResult: {
        fuelDelta: 35,
        fuelCollectedCount: 1,
        boostUntilMs: 0,
        boostCollectedCount: 1,
        rescuedCount: 1,
      },
      pickupsEnabled: true,
    });

    expect(applied.fuel).toBe(100);
    expect(applied.rescues).toBe(3);
    expect(applied.fuelTanksCollected).toBe(2);
    expect(applied.speedBoostsCollected).toBe(1);
    expect(applied.pickupLabel).toContain("Pilot rescued!");
    expect(applied.pickupLabel).toContain("Fuel +4");
  });
});
