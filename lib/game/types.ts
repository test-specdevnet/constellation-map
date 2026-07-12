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

export type CollectibleKind = "fuel" | "boost";
export type CollectibleSpawnSource = "flight-path" | "near-system";
export type RunState = "flying" | "landing" | "landed";
export type EffectKind = "trail" | "pulse" | "sparkle";
export type CombatProjectileOwner = "player" | "enemy";
export type WeatherCellKind = "rain" | "storm" | "gust";

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
  fire: boolean;
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

export type EnemyPlane = {
  id: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  health: number;
  radius: number;
  active: boolean;
  respawnAtMs: number;
  lastShotAtMs: number;
  evadeSeed: number;
};

export type CombatProjectile = {
  id: string;
  owner: CombatProjectileOwner;
  x: number;
  y: number;
  heading: number;
  speed: number;
  radius: number;
  damage: number;
  ageMs: number;
  ttlMs: number;
};

export type CombatState = {
  enemies: EnemyPlane[];
  projectiles: CombatProjectile[];
  playerHealth: number;
  playerLastShotAtMs: number;
  enemiesDefeated: number;
  shotsFired: number;
  damageTaken: number;
  spawnCounter: number;
};

export type WeatherCell = {
  id: string;
  kind: WeatherCellKind;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  driftX: number;
  driftY: number;
  phase: number;
};

export type WeatherState = {
  cells: WeatherCell[];
  boundsKey: string;
  windX: number;
  windY: number;
  severity: number;
  lightningUntilMs: number;
  lightningSeed: number;
  lastLightningAtMs: number;
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
  discoveries: number;
  distance: number;
  durationMs: number;
  weekKey: string;
  recordedAt: string;
};

export type RunRecord = {
  score: number;
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
  combat: CombatState;
  weather: WeatherState;
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
  fuelTanksCollected: number;
  speedBoostsCollected: number;
  playerHealth: number;
  enemiesActive: number;
  enemiesDefeated: number;
  incomingShots: number;
  weatherSeverity: number;
  wind: { x: number; y: number };
  lightningActive: boolean;
  multiplayerPeers: number;
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
