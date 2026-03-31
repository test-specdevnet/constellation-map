import { render, screen } from "@testing-library/react";
import { DiegeticHud } from "./DiegeticHud";
import { DEFAULT_FEATURE_FLAGS } from "../../lib/game/config";

describe("DiegeticHud", () => {
  it("renders the extended gameplay stats", () => {
    render(
      <DiegeticHud
        telemetry={{
          band: "mid",
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
          },
          camera: {
            x: 0,
            y: 0,
            zoom: 0.2,
          },
        }}
        snapshot={{
          runId: "run-1",
          fuel: 78,
          fuelMax: 100,
          hull: 66,
          hullMax: 100,
          boostRemainingMs: 4000,
          repairCooldownMs: 0,
          activeBoostLabel: "Speed Boost!",
          score: 900,
          kills: 3,
          discoveries: 8,
          state: "flying",
          crashReason: null,
          durationMs: 12_000,
          enemyCount: 2,
          fuelPackCount: 1,
          boostPackCount: 1,
          leaderboardWeek: "2026-03-30",
          qualityMode: "high",
          flags: DEFAULT_FEATURE_FLAGS,
          miniMap: {
            clusters: [],
            enemies: [],
            powerUps: [],
          },
        }}
        selectedSkinLabel="Classic"
        unlockedSkinCount={2}
        totalSkinCount={4}
      />,
    );

    expect(screen.getByText("Hull")).toBeInTheDocument();
    expect(screen.getByText("Fuel")).toBeInTheDocument();
    expect(screen.getByText("Enemies")).toBeInTheDocument();
    expect(screen.getByText("Speed Boost!")).toBeInTheDocument();
  });
});
