import type { AppSystem, Star } from "../types/star";
import type {
  EnemyDensitySetting,
  FeatureFlags,
  FlightSettings,
  HudDensitySetting,
  QualityMode,
  QualitySetting,
} from "./config";

export type {
  EnemyDensitySetting,
  FeatureFlags,
  FlightSettings,
  HudDensitySetting,
  QualityMode,
  QualitySetting,
};

export type PickupKind = "fuel" | "boost";
export type PickupSpawnSource = "flight-path" | "near-system";
export type ProjectileOwner = "player" | "enemy";
export type RunState = "flying" | "crashing" | "crashed";
export type EffectKind = "tracer" | "muzzle" | "impact" | "explosion";

export type FlightState = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  angVel: number;
};

export type FlightInputState = {
  accelerate: boolean;
  brake: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fire: boolean;
  mouseTurn: number;
};

export type Collectible = {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  radius: number;
  value: number;
  bobSeed: number;
  spinSeed: number;
  spawnedAtMs: number;
  respawnAtMs: number;
  ttlMs: number;
  source: PickupSpawnSource;
  active: boolean;
};

export type EnemyPlane = {
  id: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  fireCooldownMs: number;
  ageMs: number;
  radius: number;
  turnRate: number;
};

export type Projectile = {
  id: string;
  owner: ProjectileOwner;
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttlMs: number;
  radius: number;
  damage: number;
  heading: number;
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
  kills: number;
  discoveries: number;
  durationMs: number;
  weekKey: string;
  recordedAt: string;
};

export type RunRecord = {
  score: number;
  kills: number;
  discoveries: number;
  durationMs: number;
  weekKey: string;
  recordedAt: string;
};

export type GameState = {
  runId: string;
  state: RunState;
  fuel: number;
  fuelMax: number;
  hull: number;
  hullMax: number;
  boostUntilMs: number;
  score: number;
  kills: number;
  discoveries: Set<string>;
  crashReason: string | null;
  crashStartedAtMs: number | null;
  lastDamageAtMs: number;
  runStartedAtMs: number;
  collectibles: Collectible[];
  enemies: EnemyPlane[];
  projectiles: Projectile[];
  effects: VisualEffect[];
  nextEnemySpawnAtMs: number;
  spawnCounter: number;
  playerFireCooldownMs: number;
  runRecorded: boolean;
};

export type GameSessionSnapshot = {
  runId: string;
  fuel: number;
  fuelMax: number;
  hull: number;
  hullMax: number;
  boostRemainingMs: number;
  repairCooldownMs: number;
  activeBoostLabel: string | null;
  score: number;
  kills: number;
  discoveries: number;
  state: RunState;
  crashReason: string | null;
  durationMs: number;
  enemyCount: number;
  fuelPackCount: number;
  boostPackCount: number;
  leaderboardWeek: string;
  qualityMode: QualityMode;
  flags: FeatureFlags;
  miniMap: {
    clusters: Array<{ id: string; x: number; y: number; count: number }>;
    enemies: Array<{ id: string; x: number; y: number }>;
    powerUps: Array<{ id: string; x: number; y: number; kind: PickupKind }>;
  };
};

export type DebugHudSnapshot = {
  fps: number;
  frameMs: number;
  tickRate: number;
  counts: {
    deployments: number;
    clusters: number;
    enemies: number;
    bullets: number;
    pickups: number;
    clouds: number;
  };
  input: {
    turnAxis: number;
    throttleAxis: number;
    firePressed: boolean;
  };
  player: {
    speed: number;
    hull: number;
    fuel: number;
    boostRemainingMs: number;
  };
  lastPickupEvent: string | null;
};
