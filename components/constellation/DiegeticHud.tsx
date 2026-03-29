"use client";

import type { FlightTelemetry } from "../../lib/layout/focusContext";

const ZOOM_BASELINE = 0.178;

export function DiegeticHud({
  telemetry,
  selectedSkinLabel,
  unlockedSkinCount,
  totalSkinCount,
}: {
  telemetry: FlightTelemetry | null;
  selectedSkinLabel: string;
  unlockedSkinCount: number;
  totalSkinCount: number;
}) {
  const zoomPct = Math.round(((telemetry?.camera.zoom ?? ZOOM_BASELINE) / ZOOM_BASELINE) * 100);
  const speed = Math.round(telemetry?.plane.speed ?? 0);

  return (
    <div className="diegetic-hud" aria-label="Flight heads-up display">
      <div className="hud-chip">
        <span>Speed</span>
        <strong>{speed} kt</strong>
      </div>
      <div className="hud-chip">
        <span>Lens</span>
        <strong>{zoomPct}%</strong>
      </div>
      <div className="hud-chip">
        <span>Skin</span>
        <strong>
          {selectedSkinLabel} | {unlockedSkinCount}/{totalSkinCount}
        </strong>
      </div>
    </div>
  );
}
