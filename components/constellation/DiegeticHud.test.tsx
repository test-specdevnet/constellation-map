import { render, screen } from "@testing-library/react";
import { DiegeticHud } from "./DiegeticHud";
import { DEFAULT_FEATURE_FLAGS } from "../../lib/game/config";

describe("DiegeticHud", () => {
  const baseProps = {
    telemetry: {
      band: "mid" as const,
      activeRegionId: "region:a",
      activeRuntimeId: "runtime:node",
      nearbySystemId: "system:one",
      nearestRegionDistance: 200,
      nearestSystemDistance: 100,
      plane: {
        x: 0,
        y: 0,
        heading: 0,
        speed: 310,
        altitude: 4,
        pitch: 0.12,
      },
      camera: {
        x: 0,
        y: 0,
        zoom: 0.2,
      },
    },
    snapshot: {
      runId: "run-1",
      fuel: 78,
      fuelMax: 100,
      boostRemainingMs: 4000,
      activeBoostLabel: "Tailwind boost",
      score: 36,
      discoveries: 8,
      rescues: 3,
      fuelTanksCollected: 2,
      speedBoostsCollected: 1,
      upgradeCredits: 48,
      thrusterLevel: 1,
      fuelEfficiencyLevel: 0,
      distance: 1800,
      distanceUnits: 25,
      state: "flying" as const,
      endReason: null,
      durationMs: 12_000,
      fuelPackCount: 1,
      boostPackCount: 1,
      parachuterCount: 2,
      qualityMode: "high" as const,
      flags: DEFAULT_FEATURE_FLAGS,
      miniMap: {
        clusters: [],
        collectibles: [],
      },
    },
    selectedSkinLabel: "Classic",
    unlockedSkinCount: 2,
    totalSkinCount: 4,
  };

  it("renders the four requested run stats in detailed mode", () => {
    render(<DiegeticHud {...baseProps} mode="detailed" />);

    expect(screen.getByText("Deployments Found")).toBeInTheDocument();
    expect(screen.getByText("Speed Boosts")).toBeInTheDocument();
    expect(screen.getByText("Fuel Tanks Collected")).toBeInTheDocument();
    expect(screen.getByText("Rescues Made")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("keeps the same four stats in compact mode", () => {
    render(<DiegeticHud {...baseProps} mode="compact" />);

    expect(screen.getByText("Deployments Found")).toBeInTheDocument();
    expect(screen.getByText("Speed Boosts")).toBeInTheDocument();
    expect(screen.queryByText("Route")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });
});
