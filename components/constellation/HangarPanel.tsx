"use client";

import { useState } from "react";
import type { SkinView } from "./ProgressProvider";
import { SPRITES, getAircraftColorForSkin } from "../../lib/canvas/sprites";
import type { PlaneSkinId } from "../../lib/canvas/cartoonMarkers";

const aircraftPreviewForSkin = (skinId: PlaneSkinId) =>
  SPRITES.aircraft[getAircraftColorForSkin(skinId)].side.src;

function HangarCustomizationBody({
  skins,
  onSelectSkin,
  onResetProgress,
  onDone,
}: {
  skins: SkinView[];
  onSelectSkin: (skinId: SkinView["id"]) => void;
  onResetProgress: () => void;
  onDone?: () => void;
}) {
  return (
    <>
      <p className="hangar-panel-copy">Pick your aircraft color for the next flight.</p>
      <div className="hangar-grid">
        {skins.map((skin) => (
          <button
            key={skin.id}
            type="button"
            className={`hangar-card hangar-card--swatch-only ${
              skin.selected ? "hangar-card--selected" : ""
            }`}
            disabled={!skin.unlocked}
            onClick={() => onSelectSkin(skin.id)}
            aria-label={`Choose ${skin.label} plane paint`}
            aria-pressed={skin.selected}
            title={skin.label}
          >
            <div className={`hangar-swatch hangar-swatch--${skin.id}`}>
              <img src={aircraftPreviewForSkin(skin.id)} alt="" />
            </div>
          </button>
        ))}
      </div>

      <div className="hangar-modal-actions">
        <button type="button" className="secondary-action" onClick={onResetProgress}>
          Reset progress
        </button>
        {onDone ? (
          <button type="button" className="primary-action" onClick={onDone}>
            Done
          </button>
        ) : null}
      </div>
    </>
  );
}

export function HangarCustomizationPanel({
  skins,
  onSelectSkin,
  onResetProgress,
}: {
  skins: SkinView[];
  onSelectSkin: (skinId: SkinView["id"]) => void;
  onResetProgress: () => void;
}) {
  return (
    <section className="hangar-customization-panel" aria-label="Plane customization">
      <HangarCustomizationBody
        skins={skins}
        onSelectSkin={onSelectSkin}
        onResetProgress={onResetProgress}
      />
    </section>
  );
}

export function HangarPanel({
  skins,
  onSelectSkin,
  onResetProgress,
}: {
  skins: SkinView[];
  onSelectSkin: (skinId: SkinView["id"]) => void;
  onResetProgress: () => void;
}) {
  const [open, setOpen] = useState(false);
  const activeSkin = skins.find((skin) => skin.selected) ?? skins[0];

  return (
    <>
      <section className="panel-card panel-card--compact hangar-launcher-card">
        <div className="hangar-launcher-meta">
          <div className={`hangar-swatch hangar-swatch--${activeSkin.id}`}>
            <img src={aircraftPreviewForSkin(activeSkin.id)} alt="" />
          </div>
          <div>
            <span className="hangar-launcher-label">Plane</span>
            <strong>{skins.length} paint options</strong>
          </div>
        </div>
        <button
          type="button"
          className="secondary-action hangar-launcher-button"
          onClick={() => setOpen(true)}
        >
          Customize
        </button>
      </section>

      {open ? (
        <div className="hangar-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="hangar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hangar-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-card-header panel-card-header--compact">
              <h2 id="hangar-title">Plane customization</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setOpen(false)}
                aria-label="Close plane customization"
              >
                Close
              </button>
            </div>

            <HangarCustomizationBody
              skins={skins}
              onSelectSkin={onSelectSkin}
              onResetProgress={onResetProgress}
              onDone={() => setOpen(false)}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
