"use client";

import type { FlightTelemetry } from "../../lib/layout/focusContext";

const headingToCompass = (headingRad: number) => {
  const deg = ((headingRad * 180) / Math.PI + 450) % 360;
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(deg / 45) % labels.length;

  return {
    degrees: Math.round(deg),
    label: labels[index],
  };
};

export function DiegeticHud({
  telemetry,
  activeRegionLabel,
  activeRuntimeLabel,
  hoveredLabel,
  completedQuests,
  totalQuests,
  visitedRegions,
  inspectedApps,
  activeQuestTitle,
  activeQuestProgress,
}: {
  telemetry: FlightTelemetry | null;
  activeRegionLabel: string | null;
  activeRuntimeLabel: string | null;
  hoveredLabel: string | null;
  completedQuests: number;
  totalQuests: number;
  visitedRegions: number;
  inspectedApps: number;
  activeQuestTitle: string | null;
  activeQuestProgress: string | null;
}) {
  const heading = headingToCompass(telemetry?.plane.heading ?? -Math.PI / 2);
  const zoomPct = Math.round(((telemetry?.camera.zoom ?? 0.178) / 0.178) * 100);
  const speed = Math.round(telemetry?.plane.speed ?? 0);

  return (
    <div className="diegetic-hud" aria-label="Flight heads-up display">
      <div className="hud-chip">
        <span>Heading</span>
        <strong>
          {heading.label} {heading.degrees} deg
        </strong>
      </div>
      <div className="hud-chip">
        <span>Throttle</span>
        <strong>{speed} kt</strong>
      </div>
      <div className="hud-chip">
        <span>Lens</span>
        <strong>{zoomPct}%</strong>
      </div>
      <div className="hud-chip">
        <span>Atlas</span>
        <strong>{visitedRegions} sectors | {inspectedApps} apps</strong>
        <small>Tracked in local progress</small>
      </div>
      <div className="hud-chip">
        <span>Quest</span>
        <strong>{activeQuestTitle ?? "All quests clear"}</strong>
        <small>
          {activeQuestProgress ?? `${completedQuests}/${totalQuests} badges cleared`}
        </small>
      </div>
      <div className="hud-chip">
        <span>Focus</span>
        <strong>{activeRuntimeLabel ?? activeRegionLabel ?? "Wide orbit"}</strong>
        <small>{completedQuests}/{totalQuests} badges cleared</small>
      </div>
      <div className="hud-chip hud-chip--wide">
        <span>Signal</span>
        <strong>{hoveredLabel ?? "Sweep the clouds for closer readings"}</strong>
      </div>
    </div>
  );
}
