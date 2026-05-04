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

const plane: FlightState = {
  x: 0,
  y: 0,
  heading: 0,
  speed: 220,
  angVel: 0,
  altitude: 0,
  verticalVelocity: 0,
  pitch: 0,
};

const maintain = (
  overrides: Partial<Parameters<typeof maintainCollectibles>[0]> = {},
) =>
  maintainCollectibles({
    collectibles: [],
    bounds,
    plane,
    anchorSystems: [{ x: 180, y: 120 }, { x: -240, y: -160 }, { x: 420, y: -260 }],
    nowMs: 2_000,
    spawnCounter: 0,
    enableFuel: true,
    enableBoosts: true,
    fuelRatio: 0.6,
    boostActive: false,
    ...overrides,
  });

const fuelCollectible = (overrides: Partial<Collectible> = {}): Collectible => ({
  id: "fuel:existing",
  kind: "fuel",
  x: 120,
  y: 60,
  radius: 30,
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

  it("spawns obvious fuel and boost pickups while keeping counts bounded", () => {
    const result = maintain({ fuelRatio: 0.24 });
    const activeFuel = activeFuelCollectibles(result.collectibles);
    const activeBoost = result.collectibles.filter(
      (collectible) => collectible.active && collectible.kind === "boost",
    );

    expect(activeFuel).toHaveLength(GAME_CONFIG.fuelPickupLowActiveCap);
    expect(activeFuel.every((collectible) => collectible.source === "near-system")).toBe(true);
    expect(activeBoost).toHaveLength(GAME_CONFIG.boostPickupActiveCap);
    expect(result.collectibles).toHaveLength(
      GAME_CONFIG.fuelPickupLowActiveCap + GAME_CONFIG.boostPickupActiveCap,
    );
  });

  it("spawns low-fuel pickups from a deterministic plane lane without anchor systems", () => {
    const result = maintain({
      anchorSystems: [],
      enableBoosts: false,
      fuelRatio: 0.62,
    });
    const activeFuel = activeFuelCollectibles(result.collectibles);
    const fuel = activeFuel[0];
    const fuelDistance = fuel ? Math.hypot(fuel.x - plane.x, fuel.y - plane.y) : 0;

    expect(activeFuel).toHaveLength(2);
    expect(fuel?.source).toBe("flight-path");
    expect(fuel?.x).toBeGreaterThanOrEqual(bounds.minX + 180);
    expect(fuel?.x).toBeLessThanOrEqual(bounds.maxX - 180);
    expect(fuel?.y).toBeGreaterThanOrEqual(bounds.minY + 180);
    expect(fuel?.y).toBeLessThanOrEqual(bounds.maxY - 180);
    expect(fuelDistance).toBeGreaterThanOrEqual(GAME_CONFIG.fuelPickupSpawnMinDistance);
    expect(fuelDistance).toBeLessThanOrEqual(GAME_CONFIG.fuelPickupSpawnMaxDistance);
    expect(
      Math.abs(
        normalizeAngle(Math.atan2((fuel?.y ?? 0) - plane.y, (fuel?.x ?? 0) - plane.x) - plane.heading),
      ),
    ).toBeGreaterThanOrEqual(GAME_CONFIG.fuelPickupSpawnAvoidanceRadians);
  });

  it("keeps fuel sparse while reserves are healthy", () => {
    const result = maintain({ fuelRatio: 0.96, enableBoosts: false });

    expect(activeFuelCollectibles(result.collectibles)).toHaveLength(
      GAME_CONFIG.fuelPickupCruiseActiveCap,
    );
  });

  it("keeps fuel inactive when the fuel system is disabled", () => {
    const result = maintain({
      collectibles: [fuelCollectible({ active: true })],
      anchorSystems: [],
      enableFuel: false,
      enableBoosts: false,
      fuelRatio: 0.18,
    });

    expect(activeFuelCollectibles(result.collectibles)).toHaveLength(0);
    expect(result.collectibles.filter((collectible) => collectible.kind === "fuel")).toHaveLength(1);
  });

  it("forces a visible fuel respawn after pickup cooldown when reserves are low", () => {
    const result = maintain({
      collectibles: [
        fuelCollectible({
          id: "fuel:picked-up",
          active: false,
          respawnAtMs: 30_000,
        }),
      ],
      anchorSystems: [],
      enableBoosts: false,
      spawnCounter: 7,
      nowMs: 3_000,
      fuelRatio: 0.52,
    });
    const activeFuel = activeFuelCollectibles(result.collectibles);

    expect(activeFuel).toHaveLength(2);
    expect(activeFuel[0]?.id).not.toBe("fuel:picked-up");
    expect(result.collectibles.filter((collectible) => collectible.kind === "fuel")).toHaveLength(2);
  });

  it("respawns expired fuel immediately when reserves are critical", () => {
    const result = maintain({
      collectibles: [
        fuelCollectible({
          id: "fuel:expired",
          active: true,
          spawnedAtMs: 0,
          ttlMs: 1_000,
        }),
      ],
      anchorSystems: [],
      enableBoosts: false,
      spawnCounter: 2,
      fuelRatio: 0.16,
    });
    const activeFuel = activeFuelCollectibles(result.collectibles);

    expect(activeFuel).toHaveLength(GAME_CONFIG.fuelPickupLowActiveCap);
    expect(activeFuel.some((collectible) => collectible.id !== "fuel:expired")).toBe(true);
    const respawnedFuel = activeFuel.find((collectible) => collectible.id !== "fuel:expired");
    expect(respawnedFuel?.spawnedAtMs).toBe(2_000);
    expect(respawnedFuel?.respawnAtMs).toBe(2_000 + GAME_CONFIG.fuelPickupCriticalRespawnMs);
  });

  it("collects nearby fuel and boosts in one pass", () => {
    const result = collectNearbyCollectibles({
      collectibles: [
        {
          id: "fuel:1",
          kind: "fuel",
          x: 12,
          y: 10,
          radius: 30,
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
          radius: 28,
          value: GAME_CONFIG.boostDurationMs,
          bobSeed: 0,
          spinSeed: 0,
          spawnedAtMs: 0,
          respawnAtMs: 0,
          ttlMs: 12_000,
          source: "flight-path",
          active: true,
        },
      ],
      plane: { ...plane, speed: 280 },
      nowMs: 5_000,
      fuelRatio: 0.24,
    });

    expect(result.fuelDelta).toBe(GAME_CONFIG.fuelPickupAmount);
    expect(result.fuelCollectedCount).toBe(1);
    expect(result.boostUntilMs).toBe(5_000 + GAME_CONFIG.boostDurationMs);
    expect(result.boostCollectedCount).toBe(1);
    expect(result.effects.length).toBeGreaterThanOrEqual(3);
    expect(result.collectibles.every((collectible) => !collectible.active)).toBe(true);
  });

  it("does not allow unbounded fuel growth", () => {
    const result = maintain({
      collectibles: [
        fuelCollectible({ id: "fuel:active-1", x: 120, y: 60, active: true }),
        fuelCollectible({ id: "fuel:active-2", x: -260, y: 120, active: true }),
        fuelCollectible({ id: "fuel:active-3", x: 120, y: -260, active: true }),
        fuelCollectible({ id: "fuel:extra", x: -420, y: -120, active: true }),
      ],
      enableBoosts: false,
      fuelRatio: 0.12,
    });

    expect(result.collectibles.filter((collectible) => collectible.kind === "fuel")).toHaveLength(
      GAME_CONFIG.fuelPickupLowActiveCap,
    );
  });

  it("applies collection outcomes with fuel-top-off and boost feedback", () => {
    const applied = applyCollectibleOutcome({
      fuel: 96,
      fuelMax: 100,
      boostUntilMs: 0,
      fuelTanksCollected: 1,
      speedBoostsCollected: 0,
      collectibleResult: {
        fuelDelta: 35,
        fuelCollectedCount: 1,
        boostUntilMs: 6_000,
        boostCollectedCount: 1,
      },
      pickupsEnabled: true,
    });

    expect(applied.fuel).toBe(100);
    expect(applied.fuelTanksCollected).toBe(2);
    expect(applied.speedBoostsCollected).toBe(1);
    expect(applied.pickupLabel).toContain("Fuel +4");
    expect(applied.pickupLabel).toContain("Boost engaged");
  });
});
