"use client";

import type { DebugHudSnapshot } from "../../lib/game/types";

const formatSigned = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

export function DebugHud({
  visible,
  stats,
}: {
  visible: boolean;
  stats: DebugHudSnapshot;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="debug-hud" aria-label="Debug telemetry overlay">
      <div className="debug-hud__header">
        <strong>Debug HUD</strong>
        <span>F3 toggle</span>
      </div>

      <div className="debug-hud__grid">
        <div className="debug-hud__card">
          <span>Perf</span>
          <strong>{stats.fps.toFixed(0)} FPS</strong>
          <small>{stats.frameMs.toFixed(1)} ms frame</small>
          <small>{stats.tickRate.toFixed(0)} sim ticks/s</small>
        </div>

        <div className="debug-hud__card">
          <span>Entities</span>
          <strong>{stats.counts.deployments} deployments</strong>
          <small>{stats.counts.clusters} clusters</small>
          <small>
            {stats.counts.parachuters} parachuters · {stats.counts.powerUps} power-ups
          </small>
          <small>{stats.counts.clouds} clouds</small>
        </div>

        <div className="debug-hud__card">
          <span>Input</span>
          <strong>Turn {formatSigned(stats.input.turnAxis)}</strong>
          <small>Throttle {formatSigned(stats.input.throttleAxis)}</small>
          <small>Mouse-steer smoothing active</small>
        </div>

        <div className="debug-hud__card">
          <span>Player</span>
          <strong>{Math.round(stats.player.speed)} kt</strong>
          <small>Fuel {Math.round(stats.player.fuel)} · Route {stats.player.distanceUnits}</small>
          <small>
            {stats.player.boostRemainingMs > 0
              ? `Boost ${(stats.player.boostRemainingMs / 1000).toFixed(1)}s`
              : "Boost idle"}
          </small>
        </div>
      </div>

      <p className="debug-hud__event">
        Last collection: {stats.lastPickupEvent ?? "none"}
      </p>
    </div>
  );
}
