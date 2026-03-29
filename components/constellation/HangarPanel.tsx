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
  const unlockedCount = skins.filter((skin) => skin.unlocked).length;
  const activeSkin = skins.find((skin) => skin.selected) ?? skins[0];

  return (
    <>
      <section className="panel-card panel-card--compact hangar-launcher-card">
        <div className="hangar-launcher-meta">
          <div className={`hangar-swatch hangar-swatch--${activeSkin.id}`} />
          <div>
            <span className="hangar-launcher-label">Hangar</span>
            <strong>
              {activeSkin.label} | {unlockedCount}/{skins.length}
            </strong>
          </div>
        </div>
        <button
          type="button"
          className="secondary-action hangar-launcher-button"
          onClick={() => setOpen(true)}
        >
          Skins
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
              <h2 id="hangar-title">Plane skins</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setOpen(false)}
                aria-label="Close hangar"
              >
                Close
              </button>
            </div>

            <div className="hangar-grid">
              {skins.map((skin) => (
                <button
                  key={skin.id}
                  type="button"
                  className={`hangar-card ${skin.selected ? "hangar-card--selected" : ""}`}
                  disabled={!skin.unlocked}
                  onClick={() => onSelectSkin(skin.id)}
                >
                  <div className={`hangar-swatch hangar-swatch--${skin.id}`} />
                  <strong>{skin.label}</strong>
                  <span>{skin.unlocked ? "Ready" : skin.unlockHint}</span>
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
