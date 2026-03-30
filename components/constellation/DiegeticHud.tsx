"use client";

import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { GameSessionSnapshot } from "../../lib/game/arcade";

const ZOOM_BASELINE = 0.178;

export function DiegeticHud({
  telemetry,
  snapshot,
  selectedSkinLabel,
  unlockedSkinCount,
  totalSkinCount,
}: {
  telemetry: FlightTelemetry | null;
  snapshot: GameSessionSnapshot | null;
  selectedSkinLabel: string;
  unlockedSkinCount: number;
  totalSkinCount: number;
}) {
  const zoomPct = Math.round(((telemetry?.camera.zoom ?? ZOOM_BASELINE) / ZOOM_BASELINE) * 100);
  const speed = Math.round(telemetry?.plane.speed ?? 0);
  const score = snapshot?.score ?? 0;
  const kills = snapshot?.kills ?? 0;
  const boostSeconds = Math.ceil((snapshot?.boostRemainingMs ?? 0) / 1000);

  return (
    <div className="diegetic-hud" aria-label="Flight heads-up display">
      <div className="hud-chip">
        <span>Speed</span>
        <strong>{speed} kt</strong>
      </div>
      <div className="hud-chip">
        <span>Run</span>
        <strong>{score.toLocaleString()} pts</strong>
        <small>{kills} takedowns</small>
      </div>
      <div className="hud-chip">
        <span>Skin</span>
        <strong>
          {selectedSkinLabel} | {unlockedSkinCount}/{totalSkinCount}
        </strong>
        <small>{boostSeconds > 0 ? `Boost ${boostSeconds}s` : `Lens ${zoomPct}%`}</small>
      </div>
    </div>
  );
}
