import {
  GAME_CONFIG,
  clamp,
  generateRunId,
  getWeeklyLeaderboardKey,
  toDistanceUnits,
  type FeatureFlags,
  type QualityMode,
} from "./config";
import type {
  FlightState,
  GameSessionSnapshot,
  GameState,
  RunRecord,
} from "./types";

const distanceBetween = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

export const syncGameScore = (game: GameState) => {
  game.distanceUnits = toDistanceUnits(game.distance);
  game.score = game.distanceUnits + game.discoveries.size + game.rescues;
};

export const createGameState = (): GameState => ({
  runId: generateRunId(),
  state: "flying",
  fuel: GAME_CONFIG.fuelMax,
  fuelMax: GAME_CONFIG.fuelMax,
  boostUntilMs: 0,
  score: 0,
  distance: 0,
  distanceUnits: 0,
  rescues: 0,
  fuelTanksCollected: 0,
  speedBoostsCollected: 0,
  upgradeCredits: 0,
  thrusterLevel: 0,
  fuelEfficiencyLevel: 0,
  discoveries: new Set<string>(),
  endReason: null,
  landingStartedAtMs: null,
  runStartedAtMs: 0,
  collectibles: [],
  effects: [],
  spawnCounter: 0,
  runRecorded: false,
});

export const accumulateDistanceFlown = ({
  game,
  from,
  to,
}: {
  game: GameState;
  from: FlightState;
  to: FlightState;
}) => {
  if (game.state !== "flying") {
    return;
  }

  const delta = distanceBetween(from, to);
  if (delta <= 0.0001) {
    return;
  }

  game.distance += delta;
  syncGameScore(game);
};

export const discoverDeployment = (game: GameState, deploymentId: string) => {
  if (game.discoveries.has(deploymentId)) {
    return false;
  }

  game.discoveries.add(deploymentId);
  syncGameScore(game);
  return true;
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
    const distanceTravelled = Math.max(0, flight.speed * dt);
    if (distanceTravelled > 0.5) {
      const qualityMultiplier =
        qualityMode === "low" ? 0.92 : qualityMode === "medium" ? 1 : 1.05;
      const efficiencyMultiplier = Math.max(0.62, 1 - game.fuelEfficiencyLevel * 0.08);
      const drain =
        (distanceTravelled / GAME_CONFIG.worldUnitsPerFuelUnit) *
        qualityMultiplier *
        efficiencyMultiplier;
      const climbPenalty =
        Math.max(0, flight.verticalVelocity ?? 0) *
        dt *
        0.12 /
        GAME_CONFIG.worldUnitsPerFuelUnit;
      game.fuel = clamp(game.fuel - drain - climbPenalty, 0, game.fuelMax);
    }

    if (game.fuel <= 0) {
      game.state = "landing";
      game.endReason = "Fuel exhausted";
      game.landingStartedAtMs = nowMs;
    }
  }

  if (!featureFlags.fuelSystem) {
    game.fuel = game.fuelMax;
  }

  if (
    game.state === "landing" &&
    game.landingStartedAtMs !== null &&
    nowMs - game.landingStartedAtMs > GAME_CONFIG.runCompleteDelayMs
  ) {
    game.state = "landed";
  }
};

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
  boostRemainingMs: Math.max(0, Math.round(game.boostUntilMs - nowMs)),
  activeBoostLabel: game.boostUntilMs > nowMs ? "Tailwind boost" : null,
  score: game.score,
  discoveries: game.discoveries.size,
  rescues: game.rescues,
  fuelTanksCollected: game.fuelTanksCollected,
  speedBoostsCollected: game.speedBoostsCollected,
  upgradeCredits: game.upgradeCredits,
  thrusterLevel: game.thrusterLevel,
  fuelEfficiencyLevel: game.fuelEfficiencyLevel,
  distance: game.distance,
  distanceUnits: game.distanceUnits,
  state: game.state,
  endReason: game.endReason,
  durationMs: Math.max(0, Math.round(nowMs - game.runStartedAtMs)),
  fuelPackCount: game.collectibles.filter(
    (collectible) => collectible.active && collectible.kind === "fuel",
  ).length,
  boostPackCount: game.collectibles.filter(
    (collectible) => collectible.active && collectible.kind === "boost",
  ).length,
  parachuterCount: game.collectibles.filter(
    (collectible) => collectible.active && collectible.kind === "parachuter",
  ).length,
  qualityMode,
  flags: featureFlags,
  miniMap: {
    clusters: clusterMarkers.map((cluster) => ({
      id: cluster.id,
      x: cluster.x,
      y: cluster.y,
      count: cluster.count,
    })),
    collectibles: game.collectibles
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
  rescues: game.rescues,
  discoveries: game.discoveries.size,
  distance: game.distanceUnits,
  durationMs: Math.max(0, Math.round(nowMs - game.runStartedAtMs)),
  weekKey: getWeeklyLeaderboardKey(),
  recordedAt: new Date().toISOString(),
});
