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
  it("moves freely upward and downward on the world plane", () => {
    const start = createFlightState(0, 0);
    const up = integrateFlightState({
      flight: start,
      input: input({ accelerate: true, moveY: 1 }),
      bounds,
      dtMs: 1_000,
      qualityMode: "medium",
      boostActive: false,
    });
    const down = integrateFlightState({
      flight: start,
      input: input({ brake: true, moveY: -1 }),
      bounds,
      dtMs: 1_000,
      qualityMode: "medium",
      boostActive: false,
    });

    expect(up.y).toBeLessThan(0);
    expect(down.y).toBeGreaterThan(0);
  });

  it("moves freely left and right instead of only rotating in place", () => {
    const start = createFlightState(0, 0);
    const right = integrateFlightState({
      flight: start,
      input: input({ turnRight: true, moveX: 1 }),
      bounds,
      dtMs: 1_000,
      qualityMode: "medium",
      boostActive: false,
    });
    const left = integrateFlightState({
      flight: start,
      input: input({ turnLeft: true, moveX: -1 }),
      bounds,
      dtMs: 1_000,
      qualityMode: "medium",
      boostActive: false,
    });

    expect(right.x).toBeGreaterThan(0);
    expect(left.x).toBeLessThan(0);
  });
});
