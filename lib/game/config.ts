export type QualityMode = "low" | "medium" | "high";
export type QualitySetting = "auto" | QualityMode;
export type HudDensitySetting = "compact" | "detailed";

export type FlightSettings = {
  quality: QualitySetting;
  mouseSensitivity: number;
  hudDensity: HudDensitySetting;
};

export type FeatureFlags = {
  fuelSystem: boolean;
  pickups: boolean;
  leaderboard: boolean;
  clouds: boolean;
  deploymentClustering: boolean;
  debugHud: boolean;
};

export const DEFAULT_FLIGHT_SETTINGS: FlightSettings = {
  quality: "auto",
  mouseSensitivity: 0.72,
  hudDensity: "compact",
};

const readBooleanEnvFlag = (name: string, fallback: boolean) => {
  const raw = process.env[name];
  if (typeof raw !== "string") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "off") {
    return false;
  }
  return fallback;
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  fuelSystem: readBooleanEnvFlag("NEXT_PUBLIC_FC_FLAG_FUEL", true),
  pickups: readBooleanEnvFlag("NEXT_PUBLIC_FC_FLAG_PICKUPS", true),
  leaderboard: readBooleanEnvFlag("NEXT_PUBLIC_FC_FLAG_LEADERBOARD", true),
  clouds: readBooleanEnvFlag("NEXT_PUBLIC_FC_FLAG_CLOUDS", true),
  deploymentClustering: readBooleanEnvFlag("NEXT_PUBLIC_FC_FLAG_DEPLOYMENT_CLUSTERING", true),
  debugHud: readBooleanEnvFlag("NEXT_PUBLIC_FC_FLAG_DEBUG_HUD", false),
};

export const GAME_CONFIG = {
  fixedStepMs: 1000 / 60,
  maxFrameMs: 1000 / 15,
  zoomDefault: 0.22,
  zoomMin: 0.08,
  zoomMax: 0.46,
  fuelMax: 100,
  fuelPickupAmount: 35,
  fuelPickupVisibleThreshold: 0.74,
  fuelPickupCriticalThreshold: 0.28,
  fuelPickupCruiseRespawnMs: 24_000,
  fuelPickupCriticalRespawnMs: 14_000,
  fuelPickupSpawnMinDistance: 360,
  fuelPickupSpawnMaxDistance: 1_020,
  fuelPickupSpawnAvoidanceRadians: 0.5,
  boostDurationMs: 8_000,
  boostPickupActiveCap: 1,
  distanceUnitScale: 180,
  discoveryRadius: 220,
  runCompleteDelayMs: 1_600,
  worldUnitsPerFuelUnit: 260,
  maxParachuters: 4,
  boostPickupRespawnMs: 22_000,
  parachuterRespawnMs: 10_500,
  fuelPickupTtlMs: 34_000,
  boostPickupTtlMs: 28_000,
  parachuterTtlMs: 32_000,
  playerPickupRadius: 46,
  altitudeDefault: 0,
  altitudeMin: 0,
  altitudeMax: 12,
  climbAcceleration: 18,
  verticalDrag: 5.2,
  maxVerticalSpeed: 7,
  maxPitchRadians: 0.34,
  localSystemRadius: 1_720,
  detailSystemRadius: 1_050,
  maxVisibleSystems: {
    low: 16,
    medium: 24,
    high: 32,
  },
  maxDetailSystems: {
    low: 4,
    medium: 6,
    high: 8,
  },
  maxStarsPerSystem: {
    low: 7,
    medium: 10,
    high: 14,
  },
  maxClusterMarkers: {
    low: 12,
    medium: 18,
    high: 22,
  },
} as const;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const makeRng = (seed: string) => {
  let state = hashString(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

export const randomBetween = (rng: () => number, min: number, max: number) =>
  min + (max - min) * rng();

export const generateRunId = () =>
  `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const getWeeklyLeaderboardKey = (date = new Date()) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + offset);
  return copy.toISOString().slice(0, 10);
};

export const toDistanceUnits = (worldDistance: number) =>
  Math.max(0, Math.round(worldDistance / GAME_CONFIG.distanceUnitScale));

export const resolveQualityMode = ({
  settings,
  reducedMotion = false,
  deviceMemory,
  hardwareConcurrency,
}: {
  settings: FlightSettings;
  reducedMotion?: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}): QualityMode => {
  if (settings.quality !== "auto") {
    return settings.quality;
  }

  if (reducedMotion) {
    return "medium";
  }

  return "medium";
};
