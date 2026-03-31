import type { SceneBounds } from "../types/star";
import { GAME_CONFIG, clamp, type QualityMode } from "./config";
import type { FlightInputState, FlightState } from "./types";

export const createFlightState = (x: number, y: number): FlightState => ({
  x,
  y,
  heading: -Math.PI / 2,
  speed: 0,
  angVel: 0,
});

export const integrateFlightState = ({
  flight,
  input,
  bounds,
  dtMs,
  qualityMode,
  boostActive,
}: {
  flight: FlightState;
  input: FlightInputState;
  bounds: SceneBounds;
  dtMs: number;
  qualityMode: QualityMode;
  boostActive: boolean;
}): FlightState => {
  const dt = dtMs / 1000;
  const highQuality = qualityMode === "high";
  const lowQuality = qualityMode === "low";
  const baseTurnRate = lowQuality ? 2.7 : highQuality ? 5.2 : 4.2;
  const turnResponse = lowQuality ? 12 : highQuality ? 24 : 18;
  const accel = (lowQuality ? 430 : highQuality ? 1_120 : 860) * (boostActive ? 1.35 : 1);
  const brake = lowQuality ? 780 : highQuality ? 1_760 : 1_340;
  const passiveDrag = lowQuality ? 82 : highQuality ? 98 : 90;
  const maxSpeed = (lowQuality ? 260 : highQuality ? 760 : 620) * (boostActive ? 1.28 : 1);
  const turnInput = clamp(
    (input.turnLeft ? -1 : 0) + (input.turnRight ? 1 : 0) + input.mouseTurn,
    -1,
    1,
  );

  const nextFlight = { ...flight };
  const targetTurnRate = turnInput * baseTurnRate;
  const turnBlend = Math.min(1, turnResponse * dt);
  nextFlight.angVel += (targetTurnRate - nextFlight.angVel) * turnBlend;
  nextFlight.heading += nextFlight.angVel * dt;

  if (input.accelerate) {
    nextFlight.speed += accel * dt;
  } else if (input.brake) {
    nextFlight.speed -= brake * dt;
  } else {
    nextFlight.speed -= passiveDrag * dt;
  }

  nextFlight.speed = clamp(nextFlight.speed, 0, maxSpeed);
  nextFlight.x += Math.cos(nextFlight.heading) * nextFlight.speed * dt;
  nextFlight.y += Math.sin(nextFlight.heading) * nextFlight.speed * dt;
  nextFlight.x = clamp(nextFlight.x, bounds.minX, bounds.maxX);
  nextFlight.y = clamp(nextFlight.y, bounds.minY, bounds.maxY);

  return nextFlight;
};

export const computeCameraFollowTarget = ({
  flight,
  qualityMode,
}: {
  flight: FlightState;
  qualityMode: QualityMode;
}) => {
  const lookDistance = Math.min(qualityMode === "high" ? 520 : 460, flight.speed * 0.78);
  return {
    x: flight.x + Math.cos(flight.heading) * lookDistance * 0.12,
    y: flight.y + Math.sin(flight.heading) * lookDistance * 0.12,
  };
};

export const computeViewportWorldBounds = ({
  camera,
  canvasSize,
}: {
  camera: { x: number; y: number; zoom: number };
  canvasSize: { width: number; height: number };
}) => {
  const halfWidth = canvasSize.width / Math.max(camera.zoom, 0.001) / 2;
  const halfHeight = canvasSize.height / Math.max(camera.zoom, 0.001) / 2;
  const minX = camera.x - halfWidth;
  const maxX = camera.x + halfWidth;
  const minY = camera.y - halfHeight;
  const maxY = camera.y + halfHeight;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  } satisfies SceneBounds;
};

export const getDefaultZoom = () => GAME_CONFIG.zoomDefault;
