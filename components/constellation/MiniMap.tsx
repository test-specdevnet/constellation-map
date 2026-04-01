"use client";

import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { GameSessionSnapshot } from "../../lib/game/types";
import type { Cluster, SceneBounds } from "../../lib/types/star";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function MiniMap({
  bounds,
  regionClusters,
  telemetry,
  snapshot,
  visitedRegionIds,
  mode,
  onSelectCluster,
}: {
  bounds: SceneBounds;
  regionClusters: Cluster[];
  telemetry: FlightTelemetry | null;
  snapshot: GameSessionSnapshot | null;
  visitedRegionIds: string[];
  mode: "compact" | "detailed";
  onSelectCluster: (cluster: Cluster) => void;
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
  const activeRegion = telemetry?.activeRegionId
    ? regionClusters.find((cluster) => cluster.clusterId === telemetry.activeRegionId) ?? null
    : null;
  const headingPoint = telemetry
    ? project(
        telemetry.plane.x + Math.cos(telemetry.plane.heading) * 420,
        telemetry.plane.y + Math.sin(telemetry.plane.heading) * 420,
      )
    : planePoint;

  return (
    <div className="mini-map" aria-label="Region overview map">
      <div className="mini-map-header">
        <strong>Overview</strong>
        <span>{regionClusters.length} regions</span>
      </div>

      <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="mini-map-svg" role="img">
        <line
          x1={planePoint.x}
          y1={planePoint.y}
          x2={headingPoint.x}
          y2={headingPoint.y}
          className="mini-map-heading"
        />
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
                role="button"
                tabIndex={0}
                aria-label={`Focus ${cluster.label}`}
                onClick={() => onSelectCluster(cluster)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectCluster(cluster);
                  }
                }}
              />
            </g>
          );
        })}

        {snapshot?.miniMap.clusters.map((cluster) => {
          const point = project(cluster.x, cluster.y);
          const radius = Math.max(3, Math.min(7, 2 + Math.log2(cluster.count + 1)));
          return (
            <g key={cluster.id}>
              <rect
                x={point.x - radius}
                y={point.y - radius}
                width={radius * 2}
                height={radius * 2}
                rx="2"
                className="mini-map-cluster"
              />
            </g>
          );
        })}

        {snapshot?.miniMap.collectibles.map((collectible) => {
          const point = project(collectible.x, collectible.y);
          return (
            <circle
              key={collectible.id}
              cx={point.x}
              cy={point.y}
              r={collectible.kind === "parachuter" ? 4 : 3}
              className={`mini-map-pickup mini-map-pickup--${collectible.kind}`}
            />
          );
        })}

        <circle cx={planePoint.x} cy={planePoint.y} r="4" className="mini-map-plane" />
      </svg>

      {mode === "detailed" ? (
        <div className="mini-map-legend" aria-label="Mini-map legend">
          <span><i className="mini-map-legend-dot mini-map-legend-dot--parachuter" />Rescue</span>
          <span><i className="mini-map-legend-dot mini-map-legend-dot--fuel" />Fuel</span>
          <span><i className="mini-map-legend-dot mini-map-legend-dot--boost" />Boost</span>
          <span><i className="mini-map-legend-dot mini-map-legend-dot--cluster" />Cluster</span>
        </div>
      ) : null}

      <p className="mini-map-label">{activeRegion?.label ?? "Wide sky"}</p>
    </div>
  );
}
