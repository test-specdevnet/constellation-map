import {
  buildDeploymentVisibilityState,
  getDeploymentVisibilityAnchor,
  resolveVisibilityZoomBucket,
} from "./deploymentVisibility";
import { GAME_CONFIG } from "./config";
import type { AppSystem, Cluster, Star } from "../types/star";
import type { DeploymentVisibilityState, FlightState } from "./types";

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

const previousVisibility = (
  visibleSystems: AppSystem[],
  detailSystems: AppSystem[] = [],
): DeploymentVisibilityState => ({
  visibleSystems,
  detailSystems,
  detailSystemIds: new Set(detailSystems.map((system) => system.systemId)),
  visibleStarsBySystem: new Map(),
  clusterMarkers: [],
});

const makeFlight = (overrides: Partial<FlightState> = {}): FlightState => ({
  x: 0,
  y: 0,
  heading: 0,
  speed: 220,
  angVel: 0,
  altitude: 0,
  verticalVelocity: 0,
  pitch: 0,
  ...overrides,
});

describe("buildDeploymentVisibilityState", () => {
  it("quantizes the visibility anchor so small flight movement does not churn buoy sets", () => {
    expect(getDeploymentVisibilityAnchor(makeFlight({ x: 102, y: 199, speed: 100 }))).toEqual({
      x: 0,
      y: 0,
    });
    expect(getDeploymentVisibilityAnchor(makeFlight({ x: 214, y: 211, speed: 100 }))).toEqual({
      x: 420,
      y: 420,
    });
  });

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
      flight: makeFlight(),
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
      flight: makeFlight(),
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

  it("keeps spaced deployment systems visible instead of filling the cap from one tight cluster", () => {
    const tightSystems = Array.from({ length: 34 }, (_, index) =>
      makeSystem(`tight:${index.toString().padStart(2, "0")}`, index * 8, 0),
    );
    const spacedSystems = Array.from({ length: 4 }, (_, index) =>
      makeSystem(`spaced:${index}`, 700 + index * 260, 0),
    );

    const result = buildDeploymentVisibilityState({
      systems: [...tightSystems, ...spacedSystems],
      starsBySystem: new Map(),
      clusters: [],
      flight: makeFlight(),
      disclosure: {
        band: "mid",
        activeRegionId: null,
        activeRuntimeId: null,
      },
      selectedAppName: null,
      searchMatches: new Set<string>(),
      qualityMode: "medium",
      densityLimitsEnabled: true,
    });

    expect(result.visibleSystems).toHaveLength(GAME_CONFIG.maxVisibleSystems.medium);
    expect(result.visibleSystems.some((system) => system.systemId.startsWith("spaced:"))).toBe(true);
  });

  it("keeps previously visible systems sticky just beyond the local radius", () => {
    const sticky = makeSystem("system:sticky", GAME_CONFIG.localSystemRadius + 260, 0);

    const result = buildDeploymentVisibilityState({
      systems: [sticky],
      starsBySystem: new Map(),
      clusters: [],
      flight: makeFlight(),
      disclosure: {
        band: "mid",
        activeRegionId: null,
        activeRuntimeId: null,
      },
      selectedAppName: null,
      searchMatches: new Set<string>(),
      qualityMode: "medium",
      densityLimitsEnabled: true,
      previousVisibility: previousVisibility([sticky]),
    });

    expect(result.visibleSystems.map((system) => system.systemId)).toContain(sticky.systemId);
    expect(result.visibleSystems).toHaveLength(1);
  });

  it("drops sticky systems once they are well outside the local radius", () => {
    const stale = makeSystem("system:stale", GAME_CONFIG.localSystemRadius + 620, 0);

    const result = buildDeploymentVisibilityState({
      systems: [stale],
      starsBySystem: new Map(),
      clusters: [],
      flight: makeFlight(),
      disclosure: {
        band: "mid",
        activeRegionId: null,
        activeRuntimeId: null,
      },
      selectedAppName: null,
      searchMatches: new Set<string>(),
      qualityMode: "medium",
      densityLimitsEnabled: true,
      previousVisibility: previousVisibility([stale]),
    });

    expect(result.visibleSystems).toHaveLength(0);
  });

  it("pins selected and search matched deployments while keeping caps bounded", () => {
    const nearbySystems = Array.from({ length: GAME_CONFIG.maxVisibleSystems.low + 8 }, (_, index) =>
      makeSystem(`near:${index.toString().padStart(2, "0")}`, index * 32, 0),
    );
    const selected = makeSystem("selected", 8_000, 0);
    const searched = makeSystem("searched", -8_000, 0);

    const result = buildDeploymentVisibilityState({
      systems: [...nearbySystems, selected, searched],
      starsBySystem: new Map(),
      clusters: [],
      flight: makeFlight(),
      disclosure: {
        band: "mid",
        activeRegionId: null,
        activeRuntimeId: null,
      },
      selectedAppName: selected.appName,
      searchMatches: new Set<string>([searched.appName]),
      qualityMode: "low",
      densityLimitsEnabled: true,
    });

    expect(result.visibleSystems).toHaveLength(GAME_CONFIG.maxVisibleSystems.low);
    expect(result.visibleSystems.map((system) => system.systemId)).toEqual(
      expect.arrayContaining([selected.systemId, searched.systemId]),
    );
  });
});
