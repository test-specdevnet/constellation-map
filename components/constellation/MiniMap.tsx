"use client";

import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { Cluster, SceneBounds } from "../../lib/types/star";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function MiniMap({
  bounds,
  regionClusters,
  telemetry,
  visitedRegionIds,
}: {
  bounds: SceneBounds;
  regionClusters: Cluster[];
  telemetry: FlightTelemetry | null;
  visitedRegionIds: string[];
}) {
  const visitedSet = new Set(visitedRegionIds);
  const mapWidth = 188;
  const mapHeight = 148;

  const project = (x: number, y: number) => {
    const px = ((x - bounds.minX) / Math.max(bounds.width, 1)) * mapWidth;
    const py = ((y - bounds.minY) / Math.max(bounds.height, 1)) * mapHeight;

    return {
      x: clamp(px, 10, mapWidth - 10),
      y: clamp(py, 10, mapHeight - 10),
    };
  };

  const planePoint = telemetry
    ? project(telemetry.plane.x, telemetry.plane.y)
    : { x: mapWidth / 2, y: mapHeight / 2 };

  return (
    <div className="mini-map" aria-label="Region overview map">
      <div className="mini-map-header">
        <strong>Overview</strong>
        <span>{regionClusters.length} sectors</span>
      </div>

      <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="mini-map-svg" role="img">
        {regionClusters.map((cluster) => {
          const point = project(cluster.centroid.x, cluster.centroid.y);
          const radius = Math.max(7, Math.min(18, 6 + Math.sqrt(cluster.counts.systems)));
          const active = telemetry?.activeRegionId === cluster.clusterId;
          const visited = visitedSet.has(cluster.clusterId);

          return (
            <g key={cluster.clusterId}>
              {!visited ? (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={radius + 4}
                  className="mini-map-marker mini-map-marker--quest"
                />
              ) : null}
              <circle
                cx={point.x}
                cy={point.y}
                r={radius}
                className={`mini-map-marker ${active ? "mini-map-marker--active" : ""}`}
              />
            </g>
          );
        })}

        <circle
          cx={planePoint.x}
          cy={planePoint.y}
          r="4"
          className="mini-map-plane"
        />
      </svg>

      <p className="mini-map-label">
        {telemetry?.activeRegionId
          ? regionClusters.find((cluster) => cluster.clusterId === telemetry.activeRegionId)
              ?.label ?? "Flying between sectors"
          : "Flying between sectors"}
      </p>
    </div>
  );
}
