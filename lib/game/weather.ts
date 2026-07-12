import type { SceneBounds } from "../types/star";
import { GAME_CONFIG, clamp, type QualityMode } from "./config";
import type { FlightState, WeatherCell, WeatherState } from "./types";

type WeatherInfluence = {
  intensity: number;
  stormIntensity: number;
  gustX: number;
  gustY: number;
};

const boundsKeyFor = (bounds: SceneBounds) =>
  `${Math.round(bounds.minX)}:${Math.round(bounds.minY)}:${Math.round(bounds.maxX)}:${Math.round(bounds.maxY)}`;

export const createWeatherState = (): WeatherState => ({
  cells: [],
  boundsKey: "",
  windX: 0,
  windY: 0,
  severity: 0,
  lightningUntilMs: 0,
  lightningSeed: 0,
  lastLightningAtMs: 0,
});

const createWeatherCells = (bounds: SceneBounds, qualityMode: QualityMode): WeatherCell[] => {
  const count = GAME_CONFIG.weatherCellCount[qualityMode];
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);

  return Array.from({ length: count }, (_, index) => {
    const kind = index % 5 === 0 ? "storm" : index % 3 === 0 ? "gust" : "rain";
    const px = ((index * 37 + 19) % 100) / 100;
    const py = ((index * 53 + 31) % 100) / 100;
    const intensity = kind === "storm" ? 0.92 : kind === "gust" ? 0.68 : 0.52;
    return {
      id: `weather:${index}`,
      kind,
      x: bounds.minX + px * width,
      y: bounds.minY + py * height,
      radius: kind === "storm" ? 940 : kind === "gust" ? 760 : 620,
      intensity,
      driftX: Math.cos(index * 1.37) * (kind === "gust" ? 22 : 12),
      driftY: Math.sin(index * 1.73) * (kind === "gust" ? 18 : 10),
      phase: index * 0.719,
    };
  });
};

const wrapCell = (cell: WeatherCell, bounds: SceneBounds) => {
  const pad = cell.radius;
  const minX = bounds.minX - pad;
  const maxX = bounds.maxX + pad;
  const minY = bounds.minY - pad;
  const maxY = bounds.maxY + pad;
  const width = maxX - minX;
  const height = maxY - minY;

  if (cell.x < minX) cell.x += width;
  if (cell.x > maxX) cell.x -= width;
  if (cell.y < minY) cell.y += height;
  if (cell.y > maxY) cell.y -= height;
};

export const getWeatherInfluence = (
  weather: WeatherState,
  flight: FlightState,
): WeatherInfluence => {
  let intensity = 0;
  let stormIntensity = 0;
  let gustX = 0;
  let gustY = 0;

  for (const cell of weather.cells) {
    const distance = Math.hypot(cell.x - flight.x, cell.y - flight.y);
    const falloff = clamp(1 - distance / Math.max(cell.radius, 1), 0, 1);
    if (falloff <= 0) {
      continue;
    }

    const local = falloff * falloff * cell.intensity;
    intensity += local;
    if (cell.kind === "storm") {
      stormIntensity += local;
    }
    if (cell.kind === "gust") {
      gustX += cell.driftX * local;
      gustY += cell.driftY * local;
    }
  }

  return {
    intensity: clamp(intensity, 0, 1),
    stormIntensity: clamp(stormIntensity, 0, 1),
    gustX,
    gustY,
  };
};

export const updateWeatherState = ({
  weather,
  bounds,
  flight,
  nowMs,
  dtMs,
  qualityMode,
  enabled,
}: {
  weather: WeatherState;
  bounds: SceneBounds;
  flight: FlightState;
  nowMs: number;
  dtMs: number;
  qualityMode: QualityMode;
  enabled: boolean;
}) => {
  if (!enabled) {
    weather.severity = 0;
    weather.windX = 0;
    weather.windY = 0;
    weather.lightningUntilMs = 0;
    return getWeatherInfluence(weather, flight);
  }

  const nextBoundsKey = `${boundsKeyFor(bounds)}:${qualityMode}`;
  if (weather.boundsKey !== nextBoundsKey || weather.cells.length === 0) {
    weather.cells = createWeatherCells(bounds, qualityMode);
    weather.boundsKey = nextBoundsKey;
  }

  const dt = dtMs / 1000;
  for (const cell of weather.cells) {
    const pulse = 0.74 + Math.sin(nowMs / 2_600 + cell.phase) * 0.26;
    cell.x += cell.driftX * dt * pulse;
    cell.y += cell.driftY * dt * pulse;
    wrapCell(cell, bounds);
  }

  const influence = getWeatherInfluence(weather, flight);
  const baseWindAngle = nowMs / 13_000;
  weather.windX = Math.cos(baseWindAngle) * 0.22 + influence.gustX / 120;
  weather.windY = Math.sin(baseWindAngle * 0.82) * 0.18 + influence.gustY / 120;
  weather.severity = influence.intensity;

  if (
    influence.stormIntensity > 0.18 &&
    nowMs - weather.lastLightningAtMs >= GAME_CONFIG.weatherLightningCooldownMs
  ) {
    weather.lastLightningAtMs = nowMs;
    weather.lightningUntilMs = nowMs + GAME_CONFIG.weatherLightningDurationMs;
    weather.lightningSeed += 1;
  }

  return influence;
};

export const applyWeatherInfluence = ({
  flight,
  bounds,
  dtMs,
  weather,
  influence,
}: {
  flight: FlightState;
  bounds: SceneBounds;
  dtMs: number;
  weather: WeatherState;
  influence: WeatherInfluence;
}) => {
  if (influence.intensity <= 0.01) {
    return flight;
  }

  const dt = dtMs / 1000;
  const nextFlight = { ...flight };
  const scale = GAME_CONFIG.weatherInfluenceScale * influence.intensity;
  nextFlight.x = clamp(nextFlight.x + weather.windX * scale * dt, bounds.minX, bounds.maxX);
  nextFlight.y = clamp(nextFlight.y + weather.windY * scale * dt, bounds.minY, bounds.maxY);
  nextFlight.angVel += Math.sin(weather.lightningSeed + dtMs * 0.001) * 0.018 * influence.stormIntensity;
  return nextFlight;
};
