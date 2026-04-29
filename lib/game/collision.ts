import { clamp } from "./config";
import type { FlightState, GameState } from "./types";
import {
  DEPLOYMENT_CREDIT_VALUE,
  LANDING_MAX_SPEED,
  type DeploymentDock,
  type LandingStation,
} from "./worldLayout";
import { discoverDeployment } from "./session";

const distanceBetween = (left: { x: number; y: number }, right: { x: number; y: number }) =>
  Math.hypot(left.x - right.x, left.y - right.y);

export type NearbyStation = LandingStation & {
  distance: number;
};

export type NearbyDeployment = {
  id: string;
  appName: string;
  distance: number;
};

export type LandingAttemptResult =
  | { landed: false; station: NearbyStation | null }
  | { landed: true; station: LandingStation; refuelAmount: number };

export const findNearbyStation = ({
  stations,
  plane,
}: {
  stations: LandingStation[];
  plane: FlightState;
}): NearbyStation | null =>
  stations
    .map((station) => ({
      ...station,
      distance: distanceBetween(station, plane),
    }))
    .filter((station) => station.distance <= station.radius)
    .sort((left, right) => left.distance - right.distance)[0] ?? null;

export const canLandAtStation = ({
  plane,
  station,
  brakePressed,
}: {
  plane: FlightState;
  station: LandingStation | null;
  brakePressed: boolean;
}) => Boolean(station && brakePressed && plane.speed <= LANDING_MAX_SPEED);

export const resolveLandingAttempt = ({
  game,
  plane,
  stations,
  brakePressed,
  getRefuelAmount,
}: {
  game: GameState;
  plane: FlightState;
  stations: LandingStation[];
  brakePressed: boolean;
  getRefuelAmount: (discoveries: number, fuelMax: number) => number;
}): LandingAttemptResult => {
  const nearbyStation = findNearbyStation({ stations, plane });
  if (!nearbyStation || !canLandAtStation({ plane, station: nearbyStation, brakePressed })) {
    return { landed: false, station: nearbyStation };
  }

  let refuelAmount = 0;
  if (nearbyStation.kind === "refuel") {
    refuelAmount = getRefuelAmount(game.discoveries.size, game.fuelMax);
    game.fuel = clamp(game.fuel + refuelAmount, 0, game.fuelMax);
  }

  return {
    landed: true,
    station: {
      id: nearbyStation.id,
      kind: nearbyStation.kind,
      label: nearbyStation.label,
      x: nearbyStation.x,
      y: nearbyStation.y,
      radius: nearbyStation.radius,
    },
    refuelAmount,
  };
};

export const discoverNearbyDeployments = ({
  game,
  plane,
  deployments,
}: {
  game: GameState;
  plane: FlightState;
  deployments: DeploymentDock[];
}): NearbyDeployment | null => {
  let nearestDeployment: NearbyDeployment | null = null;

  for (const deployment of deployments) {
    const distance = distanceBetween(deployment, plane);
    if (distance <= deployment.dockRadius) {
      if (!nearestDeployment || distance < nearestDeployment.distance) {
        nearestDeployment = {
          id: deployment.id,
          appName: deployment.appName,
          distance,
        };
      }

      if (distance <= deployment.discoveryRadius && discoverDeployment(game, deployment.id)) {
        game.upgradeCredits += DEPLOYMENT_CREDIT_VALUE;
      }
    }
  }

  return nearestDeployment;
};
