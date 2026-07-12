import type { SceneBounds } from "../types/star";
import { applyWeatherInfluence, createWeatherState, updateWeatherState } from "./weather";
import type { FlightState } from "./types";

const bounds: SceneBounds = {
  minX: -1_000,
  minY: -1_000,
  maxX: 1_000,
  maxY: 1_000,
  width: 2_000,
  height: 2_000,
};

const flight = (overrides: Partial<FlightState> = {}): FlightState => ({
  x: 0,
  y: 0,
  heading: 0,
  speed: 280,
  angVel: 0,
  altitude: 0,
  verticalVelocity: 0,
  pitch: 0,
  ...overrides,
});

describe("weather", () => {
  it("creates bounded cells and reports local influence", () => {
    const weather = createWeatherState();
    const influence = updateWeatherState({
      weather,
      bounds,
      flight: flight(),
      nowMs: 1_000,
      dtMs: 16,
      qualityMode: "medium",
      enabled: true,
    });

    expect(weather.cells.length).toBeGreaterThan(0);
    expect(weather.severity).toBeGreaterThanOrEqual(0);
    expect(influence.intensity).toBeGreaterThanOrEqual(0);
  });

  it("nudges flight by local wind while clamping to bounds", () => {
    const weather = createWeatherState();
    weather.cells = [
      {
        id: "gust:test",
        kind: "gust",
        x: 0,
        y: 0,
        radius: 1_000,
        intensity: 1,
        driftX: 80,
        driftY: 0,
        phase: 0,
      },
    ];
    weather.boundsKey = "test";
    weather.windX = 1;
    weather.windY = 0;
    weather.severity = 1;
    const start = flight({ x: 995 });

    const next = applyWeatherInfluence({
      flight: start,
      bounds,
      dtMs: 1_000,
      weather,
      influence: {
        intensity: 1,
        stormIntensity: 0,
        gustX: 80,
        gustY: 0,
      },
    });

    expect(next.x).toBe(1_000);
    expect(next.y).toBe(start.y);
  });
});
