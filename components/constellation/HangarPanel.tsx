"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <section className="panel-card">
      <div className="panel-card-header">
        <div>
          <p className="eyebrow">Hangar</p>
          <h2>Plane skins</h2>
        </div>
        <span>{unlockedCount}/{skins.length} unlocked</span>
      </div>

      <div className="hangar-launcher">
        <div className={`hangar-swatch hangar-swatch--${activeSkin.id}`} />
        <div className="hangar-launcher-copy">
          <strong>{activeSkin.label}</strong>
          <span>{activeSkin.description}</span>
        </div>
        <button
          type="button"
          className="secondary-action"
          onClick={() => setOpen(true)}
        >
          Open hangar
        </button>
      </div>

      <p className="panel-copy">
        Cosmetic only. Equip unlocked skins without changing the deployment data.
      </p>

      {open ? (
        <div
          className="hangar-modal-backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="hangar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hangar-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-card-header">
              <div>
                <p className="eyebrow">Flight deck</p>
                <h2 id="hangar-modal-title">Choose a plane skin</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setOpen(false)}
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
                  <span>{skin.description}</span>
                  <small>{skin.unlocked ? "Ready to equip" : skin.unlockHint}</small>
                </button>
              ))}
            </div>

            <div className="hangar-modal-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  onResetProgress();
                  setOpen(false);
                }}
              >
                Reset progress
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => setOpen(false)}
              >
                Back to flight
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
