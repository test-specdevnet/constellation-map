import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_FEATURE_FLAGS, DEFAULT_FLIGHT_SETTINGS } from "../../lib/game/config";
import { FlightSettingsPanel } from "./FlightSettingsPanel";

describe("FlightSettingsPanel", () => {
  it("updates the persisted responsive camera setting from its toggle", () => {
    const onUpdateSettings = jest.fn();
    render(
      <FlightSettingsPanel
        open
        settings={DEFAULT_FLIGHT_SETTINGS}
        featureFlags={DEFAULT_FEATURE_FLAGS}
        qualityMode="medium"
        onClose={jest.fn()}
        onUpdateSettings={onUpdateSettings}
        onUpdateFeatureFlags={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Responsive camera" }));

    expect(onUpdateSettings).toHaveBeenCalledWith({ responsiveCamera: false });
  });
});
