import type { AppSystem, Star } from "../types/star";
import type {
  FeatureFlags,
  FlightSettings,
  HudDensitySetting,
  QualityMode,
  QualitySetting,
} from "./config";

export type {
  FeatureFlags,
  FlightSettings,
  HudDensitySetting,
  QualityMode,
  QualitySetting,
};

export type CollectibleKind = "fuel" | "boost" | "parachuter";
export type CollectibleSpawnSource = "flight-path" | "near-system" | "rescue-lane";
export type RunState = "flying" | "landing" | "landed";
export type EffectKind = "trail" | "pulse" | "sparkle";

export type FlightState = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  angVel: number;
  altitude: number;
  verticalVelocity: number;
  pitch: number;
};

export type FlightInputState = {
  accelerate: boolean;
  brake: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  mouseTurn: number;
  moveX: number;
  moveY: number;
  climb: boolean;
  dive: boolean;
  verticalAxis: number;
};

export type Collectible = {
  id: string;
  kind: CollectibleKind;
  x: number;
  y: number;
  radius: number;
  value: number;
  bobSeed: number;
  spinSeed: number;
  spawnedAtMs: number;
  respawnAtMs: number;
  ttlMs: number;
  source: CollectibleSpawnSource;
  active: boolean;
};

export type VisualEffect = {
  id: string;
  kind: EffectKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttlMs: number;
  ageMs: number;
  size: number;
  color: string;
};

export type DeploymentClusterMarker = {
  id: string;
  x: number;
  y: number;
  count: number;
  systemIds: string[];
};

export type DeploymentVisibilityState = {
  visibleSystems: AppSystem[];
  detailSystems: AppSystem[];
  detailSystemIds: Set<string>;
  visibleStarsBySystem: Map<string, Star[]>;
  clusterMarkers: DeploymentClusterMarker[];
};

export type LeaderboardEntry = {
  id: string;
  callsign: string;
  score: number;
  rescues: number;
  discoveries: number;
  distance: number;
  durationMs: number;
  weekKey: string;
  recordedAt: string;
};

export type RunRecord = {
  score: number;
  rescues: number;
  discoveries: number;
  distance: number;
  durationMs: number;
  weekKey: string;
  recordedAt: string;
};

export type GameState = {
  runId: string;
  state: RunState;
  fuel: number;
  fuelMax: number;
  boostUntilMs: number;
  score: number;
  distance: number;
  distanceUnits: number;
  rescues: number;
  fuelTanksCollected: number;
  speedBoostsCollected: number;
  upgradeCredits: number;
  thrusterLevel: number;
  fuelEfficiencyLevel: number;
  discoveries: Set<string>;
  endReason: string | null;
  landingStartedAtMs: number | null;
  runStartedAtMs: number;
  collectibles: Collectible[];
  effects: VisualEffect[];
  spawnCounter: number;
  runRecorded: boolean;
};

export type GameSessionSnapshot = {
  runId: string;
  fuel: number;
  fuelMax: number;
  boostRemainingMs: number;
  activeBoostLabel: string | null;
  score: number;
  discoveries: number;
  rescues: number;
  fuelTanksCollected: number;
  speedBoostsCollected: number;
  upgradeCredits: number;
  thrusterLevel: number;
  fuelEfficiencyLevel: number;
  distance: number;
  distanceUnits: number;
  state: RunState;
  endReason: string | null;
  durationMs: number;
  fuelPackCount: number;
  boostPackCount: number;
  parachuterCount: number;
  qualityMode: QualityMode;
  flags: FeatureFlags;
  miniMap: {
    clusters: Array<{ id: string; x: number; y: number; count: number }>;
    collectibles: Array<{ id: string; x: number; y: number; kind: CollectibleKind }>;
  };
};

export type DebugHudSnapshot = {
  fps: number;
  frameMs: number;
  tickRate: number;
  counts: {
    deployments: number;
    clusters: number;
    parachuters: number;
    powerUps: number;
    clouds: number;
  };
  input: {
    turnAxis: number;
    throttleAxis: number;
    verticalAxis: number;
  };
  player: {
    speed: number;
    altitude: number;
    verticalVelocity: number;
    pitch: number;
    fuel: number;
    boostRemainingMs: number;
    distanceUnits: number;
  };
  lastPickupEvent: string | null;
};
