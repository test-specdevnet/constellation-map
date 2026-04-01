import { fireEvent, render, screen } from "@testing-library/react";
import { HangarPanel } from "./HangarPanel";

describe("HangarPanel", () => {
  it("shows swatch-only customization options without visible color labels", () => {
    render(
      <HangarPanel
        skins={[
          {
            id: "classic",
            label: "Red",
            description: "Classic red",
            unlockHint: "Available",
            unlocked: true,
            selected: true,
          },
          {
            id: "midnight-courier",
            label: "Blue",
            description: "Blue trim",
            unlockHint: "Available",
            unlocked: true,
            selected: false,
          },
          {
            id: "sunset-scout",
            label: "Yellow",
            description: "Yellow trim",
            unlockHint: "Available",
            unlocked: true,
            selected: false,
          },
          {
            id: "mint-radar",
            label: "Green",
            description: "Green trim",
            unlockHint: "Available",
            unlocked: true,
            selected: false,
          },
        ]}
        onSelectSkin={() => undefined}
        onResetProgress={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Customize" }));

    expect(screen.queryByText("Red")).not.toBeInTheDocument();
    expect(screen.queryByText("Blue")).not.toBeInTheDocument();
    expect(screen.queryByText("Yellow")).not.toBeInTheDocument();
    expect(screen.queryByText("Green")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /choose .* plane paint/i })).toHaveLength(4);
  });
});
