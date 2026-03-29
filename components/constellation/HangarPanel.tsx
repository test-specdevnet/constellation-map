"use client";

import type { SkinView } from "./ProgressProvider";

export function HangarPanel({
  skins,
  onSelectSkin,
}: {
  skins: SkinView[];
  onSelectSkin: (skinId: SkinView["id"]) => void;
}) {
  return (
    <section className="panel-card">
      <div className="panel-card-header">
        <div>
          <p className="eyebrow">Hangar</p>
          <h2>Plane skins</h2>
        </div>
        <span>{skins.filter((skin) => skin.unlocked).length}/{skins.length} unlocked</span>
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
    </section>
  );
}
