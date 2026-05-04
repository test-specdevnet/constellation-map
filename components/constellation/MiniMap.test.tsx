import { render, screen } from "@testing-library/react";
import { MiniMap } from "./MiniMap";
import { DEFAULT_FEATURE_FLAGS } from "../../lib/game/config";
import type { GameSessionSnapshot } from "../../lib/game/types";
import type { Cluster, SceneBounds } from "../../lib/types/star";

const bounds: SceneBounds = {
  minX: -100,
  minY: -100,
  maxX: 100,
  maxY: 100,
  width: 200,
  height: 200,
};

const regionClusters: Cluster[] = [
  {
    clusterId: "region:a",
    label: "North Cloud",
    level: "region",
    parentId: null,
    kind: "region",
    centroid: { x: 0, y: 0 },
    radius: 80,
    systemIds: ["system:one"],
    starIds: ["star:one"],
    counts: {
      apps: 1,
      systems: 1,
      instances: 3,
      runtimes: 1,
    },
    rarityFlags: {
      hasRareArchetype: false,
      rareArchetypeCount: 0,
      rareArchetypeIds: [],
    },
    runtimeFamily: "mixed",
    regionLabel: "North Cloud",
  },
];

const snapshot: GameSessionSnapshot = {
  runId: "run-1",
  fuel: 78,
  fuelMax: 100,
  boostRemainingMs: 0,
  activeBoostLabel: null,
  score: 10,
  discoveries: 1,
  fuelTanksCollected: 0,
  speedBoostsCollected: 0,
  upgradeCredits: 0,
  thrusterLevel: 0,
  fuelEfficiencyLevel: 0,
  distance: 100,
  distanceUnits: 1,
  state: "flying",
  endReason: null,
  durationMs: 1000,
  fuelPackCount: 1,
  boostPackCount: 1,
  qualityMode: "high",
  flags: DEFAULT_FEATURE_FLAGS,
  miniMap: {
    clusters: [{ id: "cluster:nearby", x: 24, y: -12, count: 4 }],
    collectibles: [
      { id: "fuel:one", kind: "fuel", x: 40, y: 10 },
      { id: "boost:one", kind: "boost", x: -20, y: 16 },
    ],
  },
};

describe("MiniMap", () => {
  it("renders the overview map with region and game markers", () => {
    render(
      <MiniMap
        bounds={bounds}
        regionClusters={regionClusters}
        telemetry={{
          band: "mid",
          activeRegionId: "region:a",
          activeRuntimeId: null,
          nearbySystemId: null,
          nearestRegionDistance: 12,
          nearestSystemDistance: null,
          plane: {
            x: 0,
            y: 0,
            heading: 0,
            speed: 220,
            altitude: 3,
            pitch: 0,
          },
          camera: {
            x: 0,
            y: 0,
            zoom: 0.2,
          },
        }}
        snapshot={snapshot}
        visitedRegionIds={["region:a"]}
        mode="detailed"
        onSelectCluster={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Region overview map")).toBeInTheDocument();
    expect(screen.getByText("1 regions")).toBeInTheDocument();
    expect(screen.getByText("North Cloud")).toBeInTheDocument();
    expect(screen.getByLabelText("Mini-map legend")).toBeInTheDocument();
    expect(screen.getByLabelText("Focus North Cloud")).toBeInTheDocument();
  });
});
