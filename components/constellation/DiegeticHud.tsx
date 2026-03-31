"use client";

import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { GameSessionSnapshot } from "../../lib/game/types";

const ZOOM_BASELINE = 0.22;

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
  const hullPct = Math.round(
    ((snapshot?.hull ?? snapshot?.hullMax ?? 100) / Math.max(snapshot?.hullMax ?? 100, 1)) *
      100,
  );
  const fuelPct = Math.round(
    ((snapshot?.fuel ?? snapshot?.fuelMax ?? 100) / Math.max(snapshot?.fuelMax ?? 100, 1)) *
      100,
  );
  const boostSeconds = Math.ceil((snapshot?.boostRemainingMs ?? 0) / 1000);
  const repairSeconds = Math.ceil((snapshot?.repairCooldownMs ?? 0) / 1000);

  return (
    <div className="diegetic-hud" aria-label="Flight heads-up display">
      <div className="hud-chip">
        <span>Speed</span>
        <strong>{speed} kt</strong>
        <small>Lens {zoomPct}%</small>
      </div>
      <div className="hud-chip">
        <span>Run</span>
        <strong>{score.toLocaleString()} pts</strong>
        <small>{kills} takedowns</small>
      </div>
      <div className="hud-chip">
        <span>Hull</span>
        <strong>{hullPct}%</strong>
        <small>{repairSeconds > 0 ? `Repair in ${repairSeconds}s` : "Repair active"}</small>
      </div>
      <div className="hud-chip">
        <span>Fuel</span>
        <strong>{fuelPct}%</strong>
        <small>{Math.round(snapshot?.fuel ?? 0)} units</small>
      </div>
      <div className="hud-chip">
        <span>Boost</span>
        <strong>{snapshot?.activeBoostLabel ?? "Cruise"}</strong>
        <small>
          {boostSeconds > 0
            ? `${boostSeconds}s remaining`
            : `${selectedSkinLabel} | ${unlockedSkinCount}/${totalSkinCount}`}
        </small>
      </div>
      <div className="hud-chip">
        <span>Enemies</span>
        <strong>{snapshot?.enemyCount ?? 0}</strong>
        <small>{snapshot?.qualityMode ?? "high"} quality</small>
      </div>
    </div>
  );
}
