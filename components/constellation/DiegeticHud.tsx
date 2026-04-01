"use client";

import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { GameSessionSnapshot } from "../../lib/game/types";

type HudStat = {
  label: string;
  value: number;
};

export function DiegeticHud({
  telemetry: _telemetry,
  snapshot,
  selectedSkinLabel: _selectedSkinLabel,
  unlockedSkinCount: _unlockedSkinCount,
  totalSkinCount: _totalSkinCount,
  mode,
}: {
  telemetry: FlightTelemetry | null;
  snapshot: GameSessionSnapshot | null;
  selectedSkinLabel: string;
  unlockedSkinCount: number;
  totalSkinCount: number;
  mode: "compact" | "detailed";
}) {
  const stats: HudStat[] = [
    {
      label: "Deployments Found",
      value: snapshot?.discoveries ?? 0,
    },
    {
      label: "Speed Boosts",
      value: snapshot?.speedBoostsCollected ?? 0,
    },
    {
      label: "Fuel Tanks Collected",
      value: snapshot?.fuelTanksCollected ?? 0,
    },
    {
      label: "Rescues Made",
      value: snapshot?.rescues ?? 0,
    },
  ];

  return (
    <div
      className={`diegetic-hud ${
        mode === "compact" ? "diegetic-hud--compact" : "diegetic-hud--detailed"
      }`}
      aria-label="Flight heads-up display"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="hud-chip hud-chip--stat">
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </div>
      ))}
    </div>
  );
}
