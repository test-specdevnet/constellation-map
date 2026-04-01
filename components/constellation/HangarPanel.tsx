"use client";

import { useState } from "react";
import type { SkinView } from "./ProgressProvider";

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
          <div className={`hangar-swatch hangar-swatch--${activeSkin.id}`} />
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
                  <div className={`hangar-swatch hangar-swatch--${skin.id}`} />
                </button>
              ))}
            </div>

            <div className="hangar-modal-actions">
              <button type="button" className="secondary-action" onClick={onResetProgress}>
                Reset progress
              </button>
              <button type="button" className="primary-action" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
