import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ConstellationProgressProvider,
  useConstellationProgress,
} from "./ProgressProvider";

const STORAGE_KEY = "flux-constellation-progress-v4";

function FeatureFlagProbe() {
  const { featureFlags, flightSettings, updateFeatureFlags, updateFlightSettings } =
    useConstellationProgress();

  return (
    <div>
      <span data-testid="fuel-system">{String(featureFlags.fuelSystem)}</span>
      <span data-testid="pickups">{String(featureFlags.pickups)}</span>
      <span data-testid="clouds">{String(featureFlags.clouds)}</span>
      <span data-testid="responsive-camera">{String(flightSettings.responsiveCamera)}</span>
      <button
        type="button"
        onClick={() => updateFeatureFlags({ fuelSystem: false, clouds: false })}
      >
        Disable optional flags
      </button>
      <button
        type="button"
        onClick={() => updateFlightSettings({ responsiveCamera: true })}
      >
        Enable responsive camera
      </button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <ConstellationProgressProvider totalRegionCount={0}>
      <FeatureFlagProbe />
    </ConstellationProgressProvider>,
  );

describe("ConstellationProgressProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("migrates persisted fuel-system opt-outs back to enabled", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        featureFlags: {
          fuelSystem: false,
          pickups: false,
          leaderboard: true,
          clouds: true,
          deploymentClustering: true,
          debugHud: false,
        },
      }),
    );

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("pickups")).toHaveTextContent("false"));
    expect(screen.getByTestId("fuel-system")).toHaveTextContent("true");

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.featureFlags.fuelSystem).toBe(true);
    });
  });

  it("keeps fuel enabled when other feature flags are toggled", async () => {
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "Disable optional flags" }));

    await waitFor(() => expect(screen.getByTestId("clouds")).toHaveTextContent("false"));
    expect(screen.getByTestId("fuel-system")).toHaveTextContent("true");
  });

  it("hydrates and persists the responsive camera preference", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        flightSettings: {
          quality: "auto",
          mouseSensitivity: 0.72,
          hudDensity: "compact",
          responsiveCamera: false,
        },
      }),
    );

    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("responsive-camera")).toHaveTextContent("false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enable responsive camera" }));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.flightSettings.responsiveCamera).toBe(true);
    });
  });
});
