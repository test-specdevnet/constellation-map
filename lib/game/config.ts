export type QualityMode = "low" | "medium" | "high";
export type QualitySetting = "auto" | QualityMode;
export type EnemyDensitySetting = "low" | "medium" | "high";

export type FlightSettings = {
  quality: QualitySetting;
  enemyDensity: EnemyDensitySetting;
  mouseSensitivity: number;
};

export type FeatureFlags = {
  enemyPlanes: boolean;
  fuelSystem: boolean;
  combat: boolean;
  pickups: boolean;
  leaderboard: boolean;
  clouds: boolean;
  deploymentClustering: boolean;
  debugHud: boolean;
};

export const DEFAULT_FLIGHT_SETTINGS: FlightSettings = {
  quality: "auto",
  enemyDensity: "medium",
  mouseSensitivity: 0.72,
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
  enemyPlanes: readBooleanEnvFlag("NEXT_PUBLIC_FC_FLAG_ENEMIES", true),
  fuelSystem: readBooleanEnvFlag("NEXT_PUBLIC_FC_FLAG_FUEL", true),
  combat: readBooleanEnvFlag("NEXT_PUBLIC_FC_FLAG_COMBAT", true),
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
  hullMax: 100,
  fuelPickupAmount: 35,
  boostDurationMs: 7_000,
  discoveryScore: 45,
  enemyScore: 180,
  enemyProjectileDamage: 18,
  collisionDamage: 35,
  hullRepairDelayMs: 4_000,
  hullRepairPerSecond: 8,
  speedThresholdForFuelDrain: 40,
  baseFuelDrainPerSecond: 1.05,
  maxFuelDrainPerSecond: 3.1,
  enemySpawnDistanceMin: 1_400,
  enemySpawnDistanceMax: 2_200,
  enemySpawnConeDegrees: 140,
  enemyFireRange: 1_300,
  enemyAimWindowDegrees: 18,
  enemyDespawnDistance: 2_500,
  enemyMaxAgeMs: 45_000,
  playerProjectileSpeed: 780,
  enemyProjectileSpeed: 460,
  playerProjectileTtlMs: 1_150,
  enemyProjectileTtlMs: 1_600,
  maxFuelPickups: 3,
  maxBoostPickups: 2,
  fuelPickupRespawnMs: 12_000,
  boostPickupRespawnMs: 16_000,
  fuelPickupTtlMs: 34_000,
  boostPickupTtlMs: 28_000,
  playerPickupRadius: 34,
  playerCollisionRadius: 28,
  initialEnemySpawnMaxMs: 8_000,
  localSystemRadius: 1_720,
  detailSystemRadius: 1_050,
  maxVisibleSystems: {
    low: 18,
    medium: 28,
    high: 36,
  },
  maxDetailSystems: {
    low: 5,
    medium: 7,
    high: 9,
  },
  maxStarsPerSystem: {
    low: 8,
    medium: 12,
    high: 16,
  },
  maxClusterMarkers: {
    low: 14,
    medium: 20,
    high: 26,
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

  if ((deviceMemory ?? 8) <= 4 || (hardwareConcurrency ?? 8) <= 4) {
    return "medium";
  }

  return "high";
};

const enemyDensityMultiplier: Record<EnemyDensitySetting, number> = {
  low: 0.7,
  medium: 1,
  high: 1.2,
};

const qualityEnemyMultiplier: Record<QualityMode, number> = {
  low: 0.66,
  medium: 0.86,
  high: 1,
};

export const getEnemyCap = ({
  elapsedMs,
  score,
  qualityMode,
  enemyDensity,
}: {
  elapsedMs: number;
  score: number;
  qualityMode: QualityMode;
  enemyDensity: EnemyDensitySetting;
}) => {
  let cap = 2;
  if (elapsedMs >= 180_000 || score >= 3_000) {
    cap = 6;
  } else if (elapsedMs >= 60_000 || score >= 1_200) {
    cap = 4;
  }

  return Math.max(
    1,
    Math.round(cap * qualityEnemyMultiplier[qualityMode] * enemyDensityMultiplier[enemyDensity]),
  );
};

export const getEnemySpawnDelayMs = ({
  elapsedMs,
  score,
  qualityMode,
  seed,
}: {
  elapsedMs: number;
  score: number;
  qualityMode: QualityMode;
  seed: string;
}) => {
  const rng = makeRng(seed);
  const intensity = clamp(elapsedMs / 180_000 + score / 4_800, 0, 1);
  const qualityBias = qualityMode === "high" ? -350 : qualityMode === "medium" ? 0 : 420;
  const minDelay = 3_500 + qualityBias;
  const maxDelay = 7_800 + qualityBias;
  const delay = randomBetween(
    rng,
    minDelay,
    maxDelay - (maxDelay - minDelay) * intensity,
  );
  return Math.max(2_600, Math.round(delay));
};
