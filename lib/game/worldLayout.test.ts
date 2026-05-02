import { GAME_CONFIG } from "./config";
import {
  buildDeploymentDocks,
  buildStationLayout,
} from "./worldLayout";
import type { AppSystem, Cluster } from "../types/star";

const makeCluster = (overrides: Partial<Cluster>): Cluster => ({
  clusterId: "region:1",
  level: "region",
  parentId: null,
  label: "Region 1",
  kind: "region",
  centroid: { x: 120, y: -40 },
  radius: 1_000,
  systemIds: [],
  starIds: [],
  counts: { apps: 1, systems: 1, instances: 1, runtimes: 1 },
  rarityFlags: { hasRareArchetype: false, rareArchetypeCount: 0, rareArchetypeIds: [] },
  runtimeFamily: "mixed",
  regionLabel: "Region 1",
  ...overrides,
});

const makeSystem = (overrides: Partial<AppSystem>): AppSystem => ({
  systemId: "system:1",
  appName: "app-one",
  label: "App One",
  clusterId: "runtime:1",
  regionClusterId: "region:1",
  runtimeClusterId: "runtime:1",
  regionLabel: "Region 1",
  x: 320,
  y: 640,
  instanceCount: 3,
  runtimeFamily: "node",
  projectCategory: "misc",
  resourceTier: "small",
  status: "running",
  jitterSeed: "seed",
  jitterOffset: { x: 0, y: 0 },
  archetypeId: "arch",
  rarityFlags: { isRareArchetype: false, rareArchetypeId: null },
  ...overrides,
});

describe("worldLayout", () => {
  it("does not build refuel stations for the flight world", () => {
    const stations = buildStationLayout([
      makeCluster({ clusterId: "region:a", centroid: { x: 10, y: 20 }, radius: 200 }),
      makeCluster({
        clusterId: "region:b",
        centroid: { x: 2_210, y: 90 },
        radius: 4_000,
      }),
    ]);

    expect(stations).toEqual([]);
  });

  it("keeps refuel stations disabled even when clusters are far apart", () => {
    const stations = buildStationLayout([
      makeCluster({ clusterId: "region:a", centroid: { x: 0, y: 0 }, radius: 200 }),
      makeCluster({ clusterId: "region:b", centroid: { x: 400, y: 0 }, radius: 200 }),
      makeCluster({
        clusterId: "region:c",
        centroid: { x: 2_300, y: 0 },
        radius: 200,
      }),
    ]);

    expect(stations).toEqual([]);
  });

  it("creates deployment docks from visible systems", () => {
    const docks = buildDeploymentDocks([makeSystem({ systemId: "system:a", appName: "alpha" })]);

    expect(docks).toEqual([
      {
        id: "system:a",
        appName: "alpha",
        x: 320,
        y: 640,
        discoveryRadius: GAME_CONFIG.discoveryRadius,
        dockRadius: GAME_CONFIG.discoveryRadius * 1.18,
      },
    ]);
  });
});
