"use client";

import type { KeyboardEvent } from "react";
import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { Cluster, SceneBounds } from "../../lib/types/star";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function MiniMap({
  bounds,
  regionClusters,
  telemetry,
  visitedRegionIds,
  onFocusCluster,
}: {
  bounds: SceneBounds;
  regionClusters: Cluster[];
  telemetry: FlightTelemetry | null;
  visitedRegionIds: string[];
  onFocusCluster?: (cluster: Cluster) => void;
}) {
  const visitedSet = new Set(visitedRegionIds);
  const mapWidth = 176;
  const mapHeight = 132;

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
  const headingPoint = telemetry
    ? {
        x: planePoint.x + Math.cos(telemetry.plane.heading) * 10,
        y: planePoint.y + Math.sin(telemetry.plane.heading) * 10,
      }
    : planePoint;
  const activeCluster = telemetry?.activeRegionId
    ? regionClusters.find((cluster) => cluster.clusterId === telemetry.activeRegionId) ?? null
    : null;
  const handleClusterKeyDown =
    (cluster: Cluster) => (event: KeyboardEvent<SVGGElement>) => {
      if (!onFocusCluster) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onFocusCluster(cluster);
      }
    };

  return (
    <div className="mini-map" aria-label="Region overview map">
      <div className="mini-map-header">
        <strong>Overview</strong>
        <span>{regionClusters.length} sectors</span>
      </div>

      <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="mini-map-svg" role="img">
        <rect
          x="1"
          y="1"
          width={mapWidth - 2}
          height={mapHeight - 2}
          rx="14"
          className="mini-map-frame"
        />
        {regionClusters.map((cluster) => {
          const point = project(cluster.centroid.x, cluster.centroid.y);
          const radius = Math.max(7, Math.min(16, 6 + Math.sqrt(cluster.counts.systems)));
          const active = telemetry?.activeRegionId === cluster.clusterId;
          const visited = visitedSet.has(cluster.clusterId);

          return (
            <g
              key={cluster.clusterId}
              className={`mini-map-node ${onFocusCluster ? "mini-map-node--interactive" : ""}`}
              onClick={() => onFocusCluster?.(cluster)}
              onKeyDown={handleClusterKeyDown(cluster)}
              tabIndex={onFocusCluster ? 0 : -1}
              role={onFocusCluster ? "button" : undefined}
              aria-label={onFocusCluster ? `Jump to ${cluster.label}` : undefined}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={radius + 9}
                className="mini-map-hit"
              />
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

        <line
          x1={planePoint.x}
          y1={planePoint.y}
          x2={headingPoint.x}
          y2={headingPoint.y}
          className="mini-map-heading"
        />
        <circle
          cx={planePoint.x}
          cy={planePoint.y}
          r="4"
          className="mini-map-plane"
        />
      </svg>

      <p className="mini-map-label">
        {activeCluster?.label ?? "Flying between sectors"}
        {onFocusCluster ? " | click a sector to jump" : ""}
      </p>
    </div>
  );
}
