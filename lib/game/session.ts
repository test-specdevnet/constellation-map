import { GAME_CONFIG, generateRunId, getWeeklyLeaderboardKey, clamp, type FeatureFlags, type QualityMode } from "./config";
import type {
  Collectible,
  EnemyPlane,
  FlightState,
  GameSessionSnapshot,
  GameState,
  RunRecord,
} from "./types";

const distance = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

export const createGameState = (): GameState => ({
  runId: generateRunId(),
  state: "flying",
  fuel: GAME_CONFIG.fuelMax,
  fuelMax: GAME_CONFIG.fuelMax,
  hull: GAME_CONFIG.hullMax,
  hullMax: GAME_CONFIG.hullMax,
  boostUntilMs: 0,
  score: 0,
  kills: 0,
  discoveries: new Set<string>(),
  crashReason: null,
  crashStartedAtMs: null,
  lastDamageAtMs: 0,
  runStartedAtMs: 0,
  collectibles: [],
  enemies: [],
  projectiles: [],
  effects: [],
  nextEnemySpawnAtMs: 0,
  spawnCounter: 0,
  playerFireCooldownMs: 0,
  runRecorded: false,
});

export const applyDeploymentDiscoveries = ({
  game,
  systems,
  flight,
}: {
  game: GameState;
  systems: Array<{ systemId: string; x: number; y: number }>;
  flight: FlightState;
}) => {
  let discovered = 0;

  for (const system of systems) {
    if (
      !game.discoveries.has(system.systemId) &&
      distance(system, flight) <= 220
    ) {
      game.discoveries.add(system.systemId);
      discovered += 1;
    }
  }

  if (discovered > 0) {
    game.score += discovered * GAME_CONFIG.discoveryScore;
  }
};

export const updateRunResources = ({
  game,
  flight,
  dtMs,
  nowMs,
  qualityMode,
  featureFlags,
}: {
  game: GameState;
  flight: FlightState;
  dtMs: number;
  nowMs: number;
  qualityMode: QualityMode;
  featureFlags: FeatureFlags;
}) => {
  const dt = dtMs / 1000;

  if (game.state === "flying" && featureFlags.fuelSystem) {
    if (flight.speed > GAME_CONFIG.speedThresholdForFuelDrain) {
      const normalizedSpeed = clamp(
        (flight.speed - GAME_CONFIG.speedThresholdForFuelDrain) / 760,
        0,
        1,
      );
      const qualityMultiplier =
        qualityMode === "low" ? 0.92 : qualityMode === "medium" ? 1 : 1.05;
      const drain =
        (GAME_CONFIG.baseFuelDrainPerSecond +
          (GAME_CONFIG.maxFuelDrainPerSecond - GAME_CONFIG.baseFuelDrainPerSecond) *
            normalizedSpeed) *
        qualityMultiplier;
      game.fuel = clamp(game.fuel - drain * dt, 0, game.fuelMax);
    }

    if (game.fuel <= 0) {
      game.state = "crashing";
      game.crashReason = "Out of fuel";
      game.crashStartedAtMs = nowMs;
    }
  }

  if (
    game.state === "flying" &&
    game.hull < game.hullMax &&
    nowMs - game.lastDamageAtMs >= GAME_CONFIG.hullRepairDelayMs
  ) {
    game.hull = clamp(
      game.hull + GAME_CONFIG.hullRepairPerSecond * dt,
      0,
      game.hullMax,
    );
  }

  if (game.state === "flying" && game.hull <= 0) {
    game.state = "crashing";
    game.crashReason = "Shot down";
    game.crashStartedAtMs = nowMs;
  } else if (
    game.state === "crashing" &&
    game.crashStartedAtMs !== null &&
    nowMs - game.crashStartedAtMs > 1_600
  ) {
    game.state = "crashed";
  }
};

export const getRepairCooldownMs = (game: GameState, nowMs: number) =>
  Math.max(0, GAME_CONFIG.hullRepairDelayMs - (nowMs - game.lastDamageAtMs));

export const createSessionSnapshot = ({
  game,
  nowMs,
  qualityMode,
  featureFlags,
  clusterMarkers,
}: {
  game: GameState;
  nowMs: number;
  qualityMode: QualityMode;
  featureFlags: FeatureFlags;
  clusterMarkers: Array<{ id: string; x: number; y: number; count: number }>;
}): GameSessionSnapshot => ({
  runId: game.runId,
  fuel: game.fuel,
  fuelMax: game.fuelMax,
  hull: game.hull,
  hullMax: game.hullMax,
  boostRemainingMs: Math.max(0, Math.round(game.boostUntilMs - nowMs)),
  repairCooldownMs: getRepairCooldownMs(game, nowMs),
  activeBoostLabel: game.boostUntilMs > nowMs ? "Speed Boost!" : null,
  score: game.score,
  kills: game.kills,
  discoveries: game.discoveries.size,
  state: game.state,
  crashReason: game.crashReason,
  durationMs: Math.max(0, Math.round(nowMs - game.runStartedAtMs)),
  enemyCount: game.enemies.length,
  fuelPackCount: game.collectibles.filter(
    (collectible) => collectible.active && collectible.kind === "fuel",
  ).length,
  boostPackCount: game.collectibles.filter(
    (collectible) => collectible.active && collectible.kind === "boost",
  ).length,
  leaderboardWeek: getWeeklyLeaderboardKey(),
  qualityMode,
  flags: featureFlags,
  miniMap: {
    clusters: clusterMarkers.map((cluster) => ({
      id: cluster.id,
      x: cluster.x,
      y: cluster.y,
      count: cluster.count,
    })),
    enemies: game.enemies.map((enemy) => ({
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
    })),
    powerUps: game.collectibles
      .filter((collectible) => collectible.active)
      .map((collectible) => ({
        id: collectible.id,
        x: collectible.x,
        y: collectible.y,
        kind: collectible.kind,
      })),
  },
});

export const toRunRecord = (game: GameState, nowMs: number): RunRecord => ({
  score: game.score,
  kills: game.kills,
  discoveries: game.discoveries.size,
  durationMs: Math.max(0, Math.round(nowMs - game.runStartedAtMs)),
  weekKey: getWeeklyLeaderboardKey(),
  recordedAt: new Date().toISOString(),
});
