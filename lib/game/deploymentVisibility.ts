import type { DisclosureBand } from "../layout/focusContext";
import type { AppSystem, Cluster, Star } from "../types/star";
import { GAME_CONFIG, type QualityMode } from "./config";
import type { DeploymentClusterMarker, DeploymentVisibilityState, FlightState } from "./types";

export type VisibilityZoomBucket = "overview" | "mid" | "detail";

const distance = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const byPriorityThenDistance = (
  left: { priority: number; distance: number },
  right: { priority: number; distance: number },
) => right.priority - left.priority || left.distance - right.distance;

export const resolveVisibilityZoomBucket = ({
  zoom,
  currentBucket,
}: {
  zoom: number;
  currentBucket: VisibilityZoomBucket | null;
}): VisibilityZoomBucket => {
  if (currentBucket === "detail") {
    if (zoom < 0.24) {
      return "mid";
    }
    return "detail";
  }

  if (currentBucket === "mid") {
    if (zoom >= 0.29) {
      return "detail";
    }
    if (zoom < 0.13) {
      return "overview";
    }
    return "mid";
  }

  if (zoom >= 0.27) {
    return "detail";
  }
  if (zoom >= 0.17) {
    return "mid";
  }
  return "overview";
};

export const buildDeploymentVisibilityState = ({
  systems,
  starsBySystem,
  clusters,
  flight,
  disclosure,
  selectedAppName,
  searchMatches,
  qualityMode,
  densityLimitsEnabled,
}: {
  systems: AppSystem[];
  starsBySystem: Map<string, Star[]>;
  clusters: Cluster[];
  flight: FlightState;
  disclosure: {
    band: DisclosureBand;
    activeRegionId: string | null;
    activeRuntimeId: string | null;
  };
  selectedAppName: string | null;
  searchMatches: Set<string>;
  qualityMode: QualityMode;
  densityLimitsEnabled: boolean;
}): DeploymentVisibilityState => {
  const maxVisibleSystems = GAME_CONFIG.maxVisibleSystems[qualityMode];
  const maxDetailSystems = GAME_CONFIG.maxDetailSystems[qualityMode];
  const maxStarsPerSystem = densityLimitsEnabled ? GAME_CONFIG.maxStarsPerSystem[qualityMode] : Number.MAX_SAFE_INTEGER;
  const clusterMarkerCap = GAME_CONFIG.maxClusterMarkers[qualityMode];
  const regionIds = disclosure.activeRegionId
    ? new Set(
        systems
          .filter((system) => system.regionClusterId === disclosure.activeRegionId)
          .map((system) => system.systemId),
      )
    : new Set<string>();
  const runtimeIds = disclosure.activeRuntimeId
    ? new Set(
        systems
          .filter((system) => system.runtimeClusterId === disclosure.activeRuntimeId)
          .map((system) => system.systemId),
      )
    : new Set<string>();

  const prioritizedSystems = systems
    .map((system) => {
      const systemDistance = distance(system, flight);
      let priority = 0;
      if (system.appName === selectedAppName) priority += 100;
      if (searchMatches.has(system.appName)) priority += 70;
      if (runtimeIds.has(system.systemId)) priority += 35;
      if (regionIds.has(system.systemId)) priority += 18;
      if (systemDistance <= GAME_CONFIG.detailSystemRadius) priority += 45;
      else if (systemDistance <= GAME_CONFIG.localSystemRadius) priority += 20;

      return {
        system,
        distance: systemDistance,
        priority,
      };
    })
    .filter(
      ({ priority, distance: systemDistance }) =>
        priority > 0 || systemDistance <= GAME_CONFIG.localSystemRadius,
    )
    .sort(byPriorityThenDistance)
    .slice(0, maxVisibleSystems);

  const visibleSystems = prioritizedSystems.map(({ system }) => system);
  const detailSystems = prioritizedSystems
    .filter(
      ({ system, distance: systemDistance }) =>
        system.appName === selectedAppName ||
        searchMatches.has(system.appName) ||
        runtimeIds.has(system.systemId) ||
        systemDistance <= GAME_CONFIG.detailSystemRadius,
    )
    .slice(0, maxDetailSystems)
    .map(({ system }) => system);

  const detailSystemIds = new Set(detailSystems.map((system) => system.systemId));
  const visibleStarsBySystem = new Map<string, Star[]>();
  const clusterMarkers: DeploymentClusterMarker[] = [];

  for (const system of visibleSystems) {
    const systemStars = starsBySystem.get(system.systemId) ?? [];

    if (!detailSystemIds.has(system.systemId) || disclosure.band !== "detail") {
      if (systemStars.length > 1) {
        clusterMarkers.push({
          id: `cluster:${system.systemId}`,
          x: system.x,
          y: system.y,
          count: systemStars.length,
          systemIds: [system.systemId],
        });
      }
      continue;
    }

    const prioritizedStars = [...systemStars].sort((left, right) => {
      const leftSelected = left.appName === selectedAppName || searchMatches.has(left.appName);
      const rightSelected = right.appName === selectedAppName || searchMatches.has(right.appName);
      if (leftSelected !== rightSelected) {
        return leftSelected ? -1 : 1;
      }
      return distance(left, flight) - distance(right, flight);
    });

    const visibleStars = prioritizedStars.slice(0, maxStarsPerSystem);
    visibleStarsBySystem.set(system.systemId, visibleStars);

    if (prioritizedStars.length > visibleStars.length) {
      const hiddenCount = prioritizedStars.length - visibleStars.length;
      clusterMarkers.push({
        id: `overflow:${system.systemId}`,
        x: system.x,
        y: system.y,
        count: hiddenCount,
        systemIds: [system.systemId],
      });
    }
  }

  const clusterCentroids = clusters
    .filter((cluster) => cluster.level === "runtime")
    .map((cluster) => ({
      id: cluster.clusterId,
      x: cluster.centroid.x,
      y: cluster.centroid.y,
      count: cluster.counts.instances,
      systemIds: cluster.systemIds.filter((systemId) =>
        visibleSystems.some((system) => system.systemId === systemId),
      ),
    }))
    .filter((cluster) => cluster.systemIds.length > 1);

  const cappedClusterMarkers = [...clusterMarkers, ...clusterCentroids]
    .sort((left, right) => right.count - left.count)
    .slice(0, clusterMarkerCap);

  return {
    visibleSystems,
    detailSystems,
    detailSystemIds,
    visibleStarsBySystem,
    clusterMarkers: cappedClusterMarkers,
  };
};
