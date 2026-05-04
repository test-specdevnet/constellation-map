import { createGameState } from "./session";
import {
  discoverNearbyDeployments,
  findNearbyStation,
  resolveLandingAttempt,
} from "./collision";
import type { FlightState } from "./types";
import type { DeploymentDock, LandingStation } from "./worldLayout";

const planeAt = (x: number, y: number, speed = 0): FlightState => ({
  x,
  y,
  speed,
  heading: 0,
  angVel: 0,
  altitude: 0,
  verticalVelocity: 0,
  pitch: 0,
});

const station = (overrides: Partial<LandingStation> = {}): LandingStation => ({
  id: "station:1",
  kind: "refuel",
  label: "Refuel station",
  x: 0,
  y: 0,
  radius: 100,
  ...overrides,
});

const deployment = (overrides: Partial<DeploymentDock> = {}): DeploymentDock => ({
  id: "system:1",
  appName: "app-one",
  x: 0,
  y: 0,
  discoveryRadius: 50,
  dockRadius: 80,
  ...overrides,
});

describe("collision", () => {
  it("finds the nearest station inside its collider", () => {
    const nearby = findNearbyStation({
      stations: [
        station({ id: "far", x: 80, y: 0 }),
        station({ id: "near", x: 20, y: 0 }),
      ],
      plane: planeAt(0, 0),
    });

    expect(nearby?.id).toBe("near");
    expect(nearby?.distance).toBe(20);
  });

  it("lands and refuels only when braking under the safe speed", () => {
    const game = createGameState();
    game.fuel = 10;

    const result = resolveLandingAttempt({
      game,
      plane: planeAt(10, 0, 80),
      stations: [station()],
      brakePressed: true,
      getRefuelAmount: () => 25,
    });

    expect(result.landed).toBe(true);
    expect(game.fuel).toBe(35);
  });

  it("does not land when the plane is too fast", () => {
    const game = createGameState();

    const result = resolveLandingAttempt({
      game,
      plane: planeAt(10, 0, 220),
      stations: [station()],
      brakePressed: true,
      getRefuelAmount: () => 25,
    });

    expect(result.landed).toBe(false);
    expect(game.fuel).toBe(game.fuelMax);
  });

  it("discovers deployments within discovery radius and reports dock proximity", () => {
    const game = createGameState();
    const nearby = discoverNearbyDeployments({
      game,
      plane: planeAt(20, 0),
      deployments: [deployment()],
    });

    expect(nearby?.id).toBe("system:1");
    expect(game.discoveries.has("system:1")).toBe(true);
    expect(game.upgradeCredits).toBeGreaterThan(0);
  });

  it("reports dock proximity without discovering outside discovery radius", () => {
    const game = createGameState();
    const nearby = discoverNearbyDeployments({
      game,
      plane: planeAt(70, 0),
      deployments: [deployment()],
    });

    expect(nearby?.id).toBe("system:1");
    expect(game.discoveries.size).toBe(0);
    expect(game.upgradeCredits).toBe(0);
  });
});
