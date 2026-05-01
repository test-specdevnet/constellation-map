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
  const baseTurnRate = lowQuality ? 2.15 : highQuality ? 3.4 : 2.8;
  const turnResponse = lowQuality ? 14 : highQuality ? 22 : 18;
  const accel = (lowQuality ? 430 : highQuality ? 980 : 760) * (boostActive ? 1.55 : 1);
  const brake = lowQuality ? 680 : highQuality ? 1_360 : 1_080;
  const passiveDrag = lowQuality ? 210 : highQuality ? 310 : 260;
  const maxSpeed = (lowQuality ? 260 : highQuality ? 760 : 620) * (boostActive ? 1.45 : 1);
  const turnInput = clamp(
    input.moveX || (input.turnLeft ? -1 : 0) + (input.turnRight ? 1 : 0) + input.mouseTurn,
    -1,
    1,
  );
  const verticalInput = clamp(input.moveY || (input.accelerate ? 1 : 0) - (input.brake ? 1 : 0), -1, 1);

  const nextFlight = { ...flight };

  const targetAngVel = turnInput * baseTurnRate * (0.55 + Math.min(flight.speed / Math.max(maxSpeed, 1), 1) * 0.45);
  nextFlight.angVel += (targetAngVel - nextFlight.angVel) * Math.min(1, turnResponse * dt);
  nextFlight.heading += nextFlight.angVel * dt;
  while (nextFlight.heading > Math.PI) nextFlight.heading -= Math.PI * 2;
  while (nextFlight.heading < -Math.PI) nextFlight.heading += Math.PI * 2;

  if (verticalInput > 0.001) {
    nextFlight.speed += accel * verticalInput * dt;
  } else if (verticalInput < -0.001 || input.brake) {
    nextFlight.speed -= brake * Math.max(Math.abs(verticalInput), 1) * dt;
  } else {
    nextFlight.speed -= passiveDrag * dt;
  }

  nextFlight.speed = clamp(nextFlight.speed, 0, maxSpeed);
  if (Math.abs(turnInput) < 0.001) {
    nextFlight.angVel *= Math.max(0, 1 - turnResponse * dt);
  }

  const velocityX = Math.cos(nextFlight.heading) * nextFlight.speed;
  const velocityY = Math.sin(nextFlight.heading) * nextFlight.speed;
  nextFlight.x += velocityX * dt;
  nextFlight.y += velocityY * dt;
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
