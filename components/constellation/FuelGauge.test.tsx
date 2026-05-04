import { render, screen } from "@testing-library/react";
import { FuelGauge } from "./FuelGauge";
import { DEFAULT_FEATURE_FLAGS } from "../../lib/game/config";

describe("FuelGauge", () => {
  it("renders a critical warning when fuel is low", () => {
    render(
      <FuelGauge
        snapshot={{
          runId: "run-1",
          fuel: 14,
          fuelMax: 100,
          boostRemainingMs: 0,
          activeBoostLabel: null,
          score: 10,
          discoveries: 2,
          fuelTanksCollected: 1,
          speedBoostsCollected: 0,
          upgradeCredits: 24,
          thrusterLevel: 0,
          fuelEfficiencyLevel: 0,
          distance: 800,
          distanceUnits: 4,
          state: "flying" as const,
          endReason: null,
          durationMs: 5_000,
          fuelPackCount: 0,
          boostPackCount: 0,
          qualityMode: "high" as const,
          flags: DEFAULT_FEATURE_FLAGS,
          miniMap: {
            clusters: [],
            collectibles: [],
          },
        }}
      />,
    );

    expect(screen.getAllByText("LOW FUEL")).toHaveLength(2);
    expect(screen.getByText("14%")).toBeInTheDocument();
    expect(screen.getByText("Collect red fuel cans")).toBeInTheDocument();
  });
});
