import type { AppSystem, Cluster } from "../types/star";
import { GAME_CONFIG } from "./config";

export type StationKind = "refuel";

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

export const LANDING_RADIUS_WORLD = 780;
export const LANDING_MAX_SPEED = 145;
export const DEPLOYMENT_DOCK_RADIUS_WORLD = GAME_CONFIG.discoveryRadius * 1.18;
export const DEPLOYMENT_CREDIT_VALUE = 12;
export const REFUEL_STATION_MIN_SPACING_WORLD = 2_200;

const distanceBetween = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

export const getStationKind = (): StationKind => "refuel";

export const getStationLabel = () => "Refuel station";

export const buildStationLayout = (_regionClusters: Cluster[]): StationLayout[] => [];

export const buildDeploymentDocks = (systems: AppSystem[]): DeploymentDock[] =>
  systems.map((system) => ({
    id: system.systemId,
    appName: system.appName,
    x: system.x,
    y: system.y,
    discoveryRadius: GAME_CONFIG.discoveryRadius,
    dockRadius: DEPLOYMENT_DOCK_RADIUS_WORLD,
  }));
