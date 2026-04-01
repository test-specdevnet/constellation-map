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
  mode,
}: {
  telemetry: FlightTelemetry | null;
  snapshot: GameSessionSnapshot | null;
  selectedSkinLabel: string;
  unlockedSkinCount: number;
  totalSkinCount: number;
  mode: "compact" | "detailed";
}) {
  const zoomPct = Math.round(((telemetry?.camera.zoom ?? ZOOM_BASELINE) / ZOOM_BASELINE) * 100);
  const speed = Math.round(telemetry?.plane.speed ?? 0);
  const score = snapshot?.score ?? 0;
  const distance = snapshot?.distanceUnits ?? 0;
  const discoveries = snapshot?.discoveries ?? 0;
  const rescues = snapshot?.rescues ?? 0;
  const boostSeconds = Math.ceil((snapshot?.boostRemainingMs ?? 0) / 1000);

  if (mode === "compact") {
    return (
      <div className="diegetic-hud diegetic-hud--compact" aria-label="Flight heads-up display">
        <div className="hud-chip">
          <span>Speed</span>
          <strong>{speed} kt</strong>
          <small>Lens {zoomPct}%</small>
        </div>
        <div className="hud-chip">
          <span>Route</span>
          <strong>{distance}</strong>
          <small>{score.toLocaleString()} expedition score</small>
        </div>
        <div className="hud-chip">
          <span>Finds</span>
          <strong>{discoveries} deployments</strong>
          <small>{rescues} rescues</small>
        </div>
        <div className="hud-chip">
          <span>Status</span>
          <strong>{snapshot?.activeBoostLabel ?? "Cruise"}</strong>
          <small>
            {boostSeconds > 0
              ? `${boostSeconds}s boost`
              : `${selectedSkinLabel} | ${unlockedSkinCount}/${totalSkinCount}`}
          </small>
        </div>
      </div>
    );
  }

  return (
    <div className="diegetic-hud" aria-label="Flight heads-up display">
      <div className="hud-chip">
        <span>Speed</span>
        <strong>{speed} kt</strong>
        <small>Lens {zoomPct}%</small>
      </div>
      <div className="hud-chip">
        <span>Route</span>
        <strong>{distance}</strong>
        <small>Distance flown</small>
      </div>
      <div className="hud-chip">
        <span>Score</span>
        <strong>{score.toLocaleString()}</strong>
        <small>Distance + discoveries + rescues</small>
      </div>
      <div className="hud-chip">
        <span>Deployments</span>
        <strong>{discoveries}</strong>
        <small>Buoys discovered</small>
      </div>
      <div className="hud-chip">
        <span>Rescues</span>
        <strong>{rescues}</strong>
        <small>Parachuters collected</small>
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
    </div>
  );
}
