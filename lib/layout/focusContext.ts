import type { AppSystem, Cluster, JitterVector } from "../types/star";

export type DisclosureBand = "overview" | "mid" | "detail";

export type SceneTelemetry = {
  band: DisclosureBand;
  activeRegionId: string | null;
  activeRuntimeId: string | null;
  nearbySystemId: string | null;
  nearestRegionDistance: number | null;
  nearestSystemDistance: number | null;
};

export type FlightTelemetry = SceneTelemetry & {
  plane: {
    x: number;
    y: number;
    heading: number;
    speed: number;
  };
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
};

export const OVERVIEW_MAX_ZOOM = 0.18;
export const DETAIL_MIN_ZOOM = 0.28;
export const REGION_PROXIMITY_RADIUS = 2_200;
export const SYSTEM_PROXIMITY_RADIUS = 700;
const RUNTIME_PROXIMITY_RADIUS = 1_400;

export const FISHEYE_DEFAULTS = {
  radiusRatio: 0.25,
  minLensRadius: 120,
  maxLensRadius: 260,
  peakMagnification: 1.36,
  farContextCompression: 0.88,
  focusExponent: 1.9,
  falloffMultiplier: 1.45,
} as const;

export type FisheyeConfig = Partial<typeof FISHEYE_DEFAULTS>;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const distanceToPoint = (
  origin: { x: number; y: number },
  target: { x: number; y: number },
) => Math.hypot(target.x - origin.x, target.y - origin.y);

const findNearestCluster = (
  plane: { x: number; y: number },
  clusters: Cluster[],
) => {
  let nearest:
    | {
        cluster: Cluster;
        distance: number;
      }
    | null = null;

  for (const cluster of clusters) {
    const distance = distanceToPoint(plane, cluster.centroid);
    if (!nearest || distance < nearest.distance) {
      nearest = { cluster, distance };
    }
  }

  return nearest;
};

const findNearestSystem = (
  plane: { x: number; y: number },
  systems: AppSystem[],
) => {
  let nearest:
    | {
        system: AppSystem;
        distance: number;
      }
    | null = null;

  for (const system of systems) {
    const distance = distanceToPoint(plane, system);
    if (!nearest || distance < nearest.distance) {
      nearest = { system, distance };
    }
  }

  return nearest;
};

export const getDisclosureState = ({
  zoom,
  plane,
  clusters,
  systems,
}: {
  zoom: number;
  plane: { x: number; y: number };
  clusters: Cluster[];
  systems: AppSystem[];
}): SceneTelemetry => {
  const regionClusters = clusters.filter((cluster) => cluster.level === "region");
  const runtimeClusters = clusters.filter((cluster) => cluster.level === "runtime");
  const nearestRegion = findNearestCluster(plane, regionClusters);
  const nearestSystem = findNearestSystem(plane, systems);

  let band: DisclosureBand = "overview";

  if (
    zoom > DETAIL_MIN_ZOOM ||
    (nearestSystem && nearestSystem.distance <= SYSTEM_PROXIMITY_RADIUS)
  ) {
    band = "detail";
  } else if (
    zoom > OVERVIEW_MAX_ZOOM ||
    (nearestRegion && nearestRegion.distance <= REGION_PROXIMITY_RADIUS)
  ) {
    band = "mid";
  }

  let activeRegionId: string | null = null;
  let activeRuntimeId: string | null = null;

  if (nearestSystem && nearestSystem.distance <= RUNTIME_PROXIMITY_RADIUS) {
    activeRegionId = nearestSystem.system.regionClusterId;
    activeRuntimeId = nearestSystem.system.runtimeClusterId;
  } else if (nearestRegion && nearestRegion.distance <= REGION_PROXIMITY_RADIUS) {
    activeRegionId = nearestRegion.cluster.clusterId;

    const regionRuntimeClusters = runtimeClusters.filter(
      (cluster) => cluster.parentId === nearestRegion.cluster.clusterId,
    );
    const nearestRuntime = findNearestCluster(plane, regionRuntimeClusters);

    if (nearestRuntime && nearestRuntime.distance <= RUNTIME_PROXIMITY_RADIUS) {
      activeRuntimeId = nearestRuntime.cluster.clusterId;
    }
  }

  return {
    band,
    activeRegionId,
    activeRuntimeId,
    nearbySystemId:
      nearestSystem && nearestSystem.distance <= SYSTEM_PROXIMITY_RADIUS
        ? nearestSystem.system.systemId
        : null,
    nearestRegionDistance: nearestRegion?.distance ?? null,
    nearestSystemDistance: nearestSystem?.distance ?? null,
  };
};

const resolveFisheyeConfig = (
  overrides?: FisheyeConfig,
): typeof FISHEYE_DEFAULTS => ({
  ...FISHEYE_DEFAULTS,
  ...overrides,
});

export const getLensRadius = (
  canvasSize: { width: number; height: number },
  overrides?: FisheyeConfig,
) => {
  const config = resolveFisheyeConfig(overrides);

  return clamp(
    Math.min(canvasSize.width, canvasSize.height) * config.radiusRatio,
    config.minLensRadius,
    config.maxLensRadius,
  );
};

export const applyFisheyeToPoint = ({
  point,
  focus,
  lensRadius,
  config: configOverrides,
}: {
  point: { x: number; y: number };
  focus: { x: number; y: number };
  lensRadius: number;
  config?: FisheyeConfig;
}) => {
  const config = resolveFisheyeConfig(configOverrides);
  const dx = point.x - focus.x;
  const dy = point.y - focus.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 1e-6 || lensRadius <= 0) {
    return {
      x: point.x,
      y: point.y,
      radialScale: config.peakMagnification,
    };
  }

  let radialScale = 1;

  if (distance <= lensRadius) {
    const ratio = clamp(distance / lensRadius, 0, 1);
    radialScale =
      config.peakMagnification -
      (config.peakMagnification - 1) * Math.pow(ratio, config.focusExponent);
  } else {
    const ratio =
      (distance - lensRadius) / (lensRadius * config.falloffMultiplier);
    radialScale =
      1 -
      (1 - config.farContextCompression) * (1 - Math.exp(-Math.max(0, ratio)));
    radialScale = clamp(radialScale, config.farContextCompression, 1);
  }

  const nextDistance = distance * radialScale;
  const nx = dx / distance;
  const ny = dy / distance;

  return {
    x: focus.x + nx * nextDistance,
    y: focus.y + ny * nextDistance,
    radialScale,
  };
};

export const getDensityAlpha = ({
  density,
  band,
  emphasis = 0,
}: {
  density: number;
  band: DisclosureBand;
  emphasis?: number;
}) => {
  const base =
    band === "overview" ? 0.46 : band === "mid" ? 0.56 : 0.74;
  const penalty = Math.min(0.2, Math.log2(Math.max(1, density)) * 0.045);

  return clamp(base - penalty + emphasis, 0.24, 0.96);
};

export const scaleDensityJitter = ({
  jitterOffset,
  density,
  band,
  multiplier = 1,
}: {
  jitterOffset: JitterVector;
  density: number;
  band: DisclosureBand;
  multiplier?: number;
}) => {
  const densityBoost = clamp(1 + Math.log2(Math.max(1, density)) * 0.16, 1, 1.9);
  const bandScale =
    band === "overview" ? 0.55 : band === "mid" ? 0.82 : 1.08;

  return {
    x: jitterOffset.x * densityBoost * bandScale * multiplier,
    y: jitterOffset.y * densityBoost * bandScale * multiplier,
  };
};

export const getClusterRenderRadius = ({
  cluster,
  band,
  isActive,
}: {
  cluster: Cluster;
  band: DisclosureBand;
  isActive: boolean;
}) => {
  const base = cluster.level === "region" ? 46 : 26;
  const densityBoost =
    Math.sqrt(cluster.counts.systems + Math.max(1, cluster.counts.instances) * 0.08) *
    (cluster.level === "region" ? 3.4 : 2.6);
  const bandBoost = band === "overview" ? 1.16 : band === "mid" ? 1 : 0.9;
  const focusBoost = isActive ? 1.12 : 1;

  return Math.max(18, (base + densityBoost) * bandBoost * focusBoost);
};

export const getAnchorRadius = ({
  instanceCount,
  band,
  isRare,
}: {
  instanceCount: number;
  band: DisclosureBand;
  isRare: boolean;
}) => {
  const base = band === "mid" ? 11 : 9;
  const countBoost = Math.min(9, Math.sqrt(Math.max(1, instanceCount)) * 2.1);
  const rarityBoost = isRare ? 2.4 : 0;

  return base + countBoost + rarityBoost;
};
