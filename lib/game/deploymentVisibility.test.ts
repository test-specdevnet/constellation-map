import { buildDeploymentVisibilityState, resolveVisibilityZoomBucket } from "./deploymentVisibility";
import { GAME_CONFIG } from "./config";
import type { AppSystem, Cluster, Star } from "../types/star";

const makeSystem = (systemId: string, x: number, y: number): AppSystem => ({
  systemId,
  appName: systemId,
  label: systemId,
  clusterId: "runtime:node",
  regionClusterId: "region:east",
  runtimeClusterId: "runtime:node",
  regionLabel: "East",
  x,
  y,
  instanceCount: 24,
  runtimeFamily: "node",
  projectCategory: "api",
  resourceTier: "medium",
  status: "running",
  jitterSeed: systemId,
  jitterOffset: { x: 0, y: 0 },
  archetypeId: "node:api",
  rarityFlags: {
    isRareArchetype: false,
    rareArchetypeId: null,
  },
});

const makeStar = (systemId: string, index: number): Star => ({
  id: `${systemId}:star:${index}`,
  type: "instance",
  x: 20 + index * 6,
  y: 18 + index * 5,
  size: 4,
  brightness: 1,
  colorBucket: "node",
  appName: systemId,
  appId: systemId,
  clusterId: "runtime:node",
  regionClusterId: "region:east",
  runtimeClusterId: "runtime:node",
  systemId,
  label: systemId,
  isRecommended: true,
  status: "running",
  healthBand: "healthy",
  runtimeFamily: "node",
  projectCategory: "api",
  resourceTier: "medium",
  region: "East",
  jitterSeed: `${systemId}:${index}`,
  jitterOffset: { x: 0, y: 0 },
  archetypeId: "node:api",
  rarityFlags: {
    isRareArchetype: false,
    rareArchetypeId: null,
  },
  metadata: {},
});

describe("buildDeploymentVisibilityState", () => {
  it("uses hysteresis for zoom buckets so cluster bands do not flap", () => {
    expect(resolveVisibilityZoomBucket({ zoom: 0.28, currentBucket: "mid" })).toBe("mid");
    expect(resolveVisibilityZoomBucket({ zoom: 0.3, currentBucket: "mid" })).toBe("detail");
    expect(resolveVisibilityZoomBucket({ zoom: 0.23, currentBucket: "detail" })).toBe("mid");
    expect(resolveVisibilityZoomBucket({ zoom: 0.14, currentBucket: "overview" })).toBe("overview");
    expect(resolveVisibilityZoomBucket({ zoom: 0.18, currentBucket: "overview" })).toBe("mid");
  });

  it("clusters systems in overview mode instead of flooding individual stars", () => {
    const system = makeSystem("system:alpha", 0, 0);
    const starsBySystem = new Map([[system.systemId, Array.from({ length: 12 }, (_, index) => makeStar(system.systemId, index))]]);

    const result = buildDeploymentVisibilityState({
      systems: [system],
      starsBySystem,
      clusters: [],
      flight: { x: 0, y: 0, heading: 0, speed: 220, angVel: 0 },
      disclosure: {
        band: "overview",
        activeRegionId: "region:east",
        activeRuntimeId: "runtime:node",
      },
      selectedAppName: null,
      searchMatches: new Set<string>(),
      qualityMode: "high",
      densityLimitsEnabled: true,
    });

    expect(result.visibleSystems).toHaveLength(1);
    expect(result.visibleStarsBySystem.size).toBe(0);
    expect(result.clusterMarkers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `cluster:${system.systemId}`,
          count: 12,
        }),
      ]),
    );
  });

  it("caps detail stars per system and exposes an overflow cluster marker", () => {
    const system = makeSystem("system:alpha", 0, 0);
    const starsBySystem = new Map([[system.systemId, Array.from({ length: 30 }, (_, index) => makeStar(system.systemId, index))]]);
    const clusters: Cluster[] = [
      {
        clusterId: "runtime:node",
        level: "runtime",
        parentId: "region:east",
        label: "Node",
        kind: "runtime",
        centroid: { x: 0, y: 0 },
        radius: 120,
        systemIds: [system.systemId],
        starIds: [],
        counts: {
          apps: 1,
          systems: 1,
          instances: 30,
          runtimes: 1,
        },
        rarityFlags: {
          hasRareArchetype: false,
          rareArchetypeCount: 0,
          rareArchetypeIds: [],
        },
        runtimeFamily: "node",
        regionLabel: "East",
      },
    ];

    const result = buildDeploymentVisibilityState({
      systems: [system],
      starsBySystem,
      clusters,
      flight: { x: 0, y: 0, heading: 0, speed: 220, angVel: 0 },
      disclosure: {
        band: "detail",
        activeRegionId: "region:east",
        activeRuntimeId: "runtime:node",
      },
      selectedAppName: system.appName,
      searchMatches: new Set<string>(),
      qualityMode: "high",
      densityLimitsEnabled: true,
    });

    expect(result.visibleStarsBySystem.get(system.systemId)).toHaveLength(
      GAME_CONFIG.maxStarsPerSystem.high,
    );
    expect(result.clusterMarkers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `overflow:${system.systemId}`,
          count: 30 - GAME_CONFIG.maxStarsPerSystem.high,
        }),
      ]),
    );
  });
});
