import { DEFAULT_FEATURE_FLAGS } from "./config";
import {
  accumulateDistanceFlown,
  createGameState,
  createSessionSnapshot,
  discoverDeployment,
  updateRunResources,
} from "./session";
import type { FlightState } from "./types";

const flight = (overrides: Partial<FlightState> = {}): FlightState => ({
  x: 0,
  y: 0,
  heading: 0,
  speed: 0,
  angVel: 0,
  altitude: 0,
  verticalVelocity: 0,
  pitch: 0,
  ...overrides,
});

describe("session", () => {
  it("tracks distance, discoveries, and score for exploration runs", () => {
    const game = createGameState();

    accumulateDistanceFlown({
      game,
      from: flight({ speed: 200 }),
      to: flight({ x: 360, speed: 200 }),
    });
    const discovered = discoverDeployment(game, "system:alpha");

    expect(discovered).toBe(true);
    expect(game.distance).toBeGreaterThan(0);
    expect(game.distanceUnits).toBeGreaterThan(0);
    expect(game.discoveries.size).toBe(1);
    expect(game.score).toBe(game.distanceUnits + 1);
  });

  it("only discovers a deployment once per click target", () => {
    const game = createGameState();

    expect(discoverDeployment(game, "system:alpha")).toBe(true);
    expect(discoverDeployment(game, "system:alpha")).toBe(false);
    expect(game.discoveries.size).toBe(1);
  });

  it("keeps draining fuel while the plane is still moving", () => {
    const game = createGameState();

    updateRunResources({
      game,
      flight: flight({ speed: 24 }),
      dtMs: 3_000,
      nowMs: 3_000,
      qualityMode: "medium",
      featureFlags: DEFAULT_FEATURE_FLAGS,
    });

    expect(game.fuel).toBeLessThan(game.fuelMax);
    expect(game.state).toBe("flying");
  });

  it("keeps fuel depletion active even if stale progress disabled the fuel flag", () => {
    const game = createGameState();

    updateRunResources({
      game,
      flight: flight({ speed: 220 }),
      dtMs: 1_000,
      nowMs: 1_000,
      qualityMode: "medium",
      featureFlags: { ...DEFAULT_FEATURE_FLAGS, fuelSystem: false },
    });

    expect(game.fuel).toBeLessThan(game.fuelMax);
  });

  it("adds only a small fuel penalty while climbing", () => {
    const cruise = createGameState();
    const climbing = createGameState();

    updateRunResources({
      game: cruise,
      flight: flight({ speed: 240, verticalVelocity: 0 }),
      dtMs: 2_000,
      nowMs: 2_000,
      qualityMode: "medium",
      featureFlags: DEFAULT_FEATURE_FLAGS,
    });
    updateRunResources({
      game: climbing,
      flight: flight({ speed: 240, verticalVelocity: 5 }),
      dtMs: 2_000,
      nowMs: 2_000,
      qualityMode: "medium",
      featureFlags: DEFAULT_FEATURE_FLAGS,
    });

    expect(climbing.fuel).toBeLessThan(cruise.fuel);
    expect(cruise.fuel - climbing.fuel).toBeLessThan(0.01);
  });

  it("lands the run after fuel exhaustion", () => {
    const game = createGameState();
    game.runStartedAtMs = 0;
    game.fuel = 1;

    updateRunResources({
      game,
      flight: flight({ speed: 260 }),
      dtMs: 2_000,
      nowMs: 2_000,
      qualityMode: "high",
      featureFlags: DEFAULT_FEATURE_FLAGS,
    });

    expect(game.state).toBe("landing");
    expect(game.endReason).toBe("Fuel exhausted");

    updateRunResources({
      game,
      flight: flight({ speed: 90 }),
      dtMs: 2_000,
      nowMs: 4_000,
      qualityMode: "high",
      featureFlags: DEFAULT_FEATURE_FLAGS,
    });

    expect(game.state).toBe("landed");
  });

  it("captures expedition HUD state including collectibles on the minimap", () => {
    const game = createGameState();
    game.runStartedAtMs = 0;
    game.boostUntilMs = 7_000;
    game.distance = 720;
    game.distanceUnits = 4;
    game.fuelTanksCollected = 3;
    game.speedBoostsCollected = 1;
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
      {
        id: "boost:1",
        kind: "boost",
        x: -20,
        y: 12,
        radius: 28,
        value: 8_000,
        bobSeed: 0,
        spinSeed: 0,
        spawnedAtMs: 0,
        respawnAtMs: 0,
        ttlMs: 10_000,
        source: "near-system",
        active: true,
      },
    ];

    const snapshot = createSessionSnapshot({
      game,
      nowMs: 1_000,
      qualityMode: "medium",
      featureFlags: DEFAULT_FEATURE_FLAGS,
      clusterMarkers: [{ id: "cluster:1", x: 0, y: 0, count: 9 }],
    });

    expect(snapshot.activeBoostLabel).toBe("Tailwind boost");
    expect(snapshot.fuelTanksCollected).toBe(3);
    expect(snapshot.speedBoostsCollected).toBe(1);
    expect(snapshot.flags.pickups).toBe(true);
    expect(snapshot.miniMap.clusters).toHaveLength(1);
    expect(snapshot.miniMap.collectibles).toHaveLength(2);
  });
});
