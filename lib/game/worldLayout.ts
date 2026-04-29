import type { AppSystem, Cluster } from "../types/star";
import { GAME_CONFIG } from "./config";

export type StationKind = "refuel" | "upgrade";

export type LandingStation = {
  id: string;
  kind: StationKind;
  label: string;
  x: number;
  y: number;
  radius: number;
};

export type StationLayout = LandingStation & {
  cluster: Cluster;
};

export type DeploymentDock = {
  id: string;
  appName: string;
  x: number;
  y: number;
  discoveryRadius: number;
  dockRadius: number;
};

export const LANDING_RADIUS_WORLD = 520;
export const LANDING_MAX_SPEED = 145;
export const DEPLOYMENT_DOCK_RADIUS_WORLD = GAME_CONFIG.discoveryRadius * 1.18;
export const DEPLOYMENT_CREDIT_VALUE = 12;

export const getStationKind = (index: number): StationKind =>
  index % 2 === 0 ? "refuel" : "upgrade";

export const getStationLabel = (kind: StationKind) =>
  kind === "refuel" ? "Refuel station" : "Upgrade lab";

export const buildStationLayout = (regionClusters: Cluster[]): StationLayout[] =>
  regionClusters.map((cluster, index) => {
    const kind = getStationKind(index);
    return {
      id: cluster.clusterId,
      kind,
      label: getStationLabel(kind),
      x: cluster.centroid.x,
      y: cluster.centroid.y,
      radius: Math.max(LANDING_RADIUS_WORLD, cluster.radius * 0.28),
      cluster,
    };
  });

export const buildDeploymentDocks = (systems: AppSystem[]): DeploymentDock[] =>
  systems.map((system) => ({
    id: system.systemId,
    appName: system.appName,
    x: system.x,
    y: system.y,
    discoveryRadius: GAME_CONFIG.discoveryRadius,
    dockRadius: DEPLOYMENT_DOCK_RADIUS_WORLD,
  }));
