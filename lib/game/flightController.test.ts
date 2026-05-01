import type { SceneBounds } from "../types/star";
import { createFlightState, integrateFlightState } from "./flightController";
import type { FlightInputState } from "./types";

const bounds: SceneBounds = {
  minX: -10_000,
  minY: -10_000,
  maxX: 10_000,
  maxY: 10_000,
  width: 20_000,
  height: 20_000,
};

const input = (overrides: Partial<FlightInputState>): FlightInputState => ({
  accelerate: false,
  brake: false,
  turnLeft: false,
  turnRight: false,
  mouseTurn: 0,
  moveX: 0,
  moveY: 0,
  ...overrides,
});

describe("integrateFlightState", () => {
  it("accelerates forward and brakes without reversing", () => {
    const start = createFlightState(0, 0);
    const up = integrateFlightState({
      flight: start,
      input: input({ accelerate: true, moveY: 1 }),
      bounds,
      dtMs: 250,
      qualityMode: "medium",
      boostActive: false,
    });
    const down = integrateFlightState({
      flight: { ...up, speed: 120 },
      input: input({ brake: true, moveY: -1 }),
      bounds,
      dtMs: 250,
      qualityMode: "medium",
      boostActive: false,
    });

    expect(up.y).toBeLessThan(0);
    expect(down.speed).toBeLessThan(120);
    expect(down.y).toBeLessThanOrEqual(up.y);
  });

  it("turns by changing heading instead of building sticky lateral drift", () => {
    const start = { ...createFlightState(0, 0), speed: 260 };
    const right = integrateFlightState({
      flight: start,
      input: input({ turnRight: true, moveX: 1 }),
      bounds,
      dtMs: 250,
      qualityMode: "medium",
      boostActive: false,
    });
    const left = integrateFlightState({
      flight: start,
      input: input({ turnLeft: true, moveX: -1 }),
      bounds,
      dtMs: 250,
      qualityMode: "medium",
      boostActive: false,
    });

    expect(right.x).toBeGreaterThan(0);
    expect(left.x).toBeLessThan(0);
    expect(right.heading).toBeGreaterThan(start.heading);
    expect(left.heading).toBeLessThan(start.heading);
  });

  it("damps angular velocity when turn input is released", () => {
    const turning = { ...createFlightState(0, 0), speed: 260, angVel: 2 };
    const released = integrateFlightState({
      flight: turning,
      input: input({}),
      bounds,
      dtMs: 100,
      qualityMode: "medium",
      boostActive: false,
    });

    expect(Math.abs(released.angVel)).toBeLessThan(Math.abs(turning.angVel));
  });
});
