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
  const accel = (lowQuality ? 430 : highQuality ? 1_120 : 860) * (boostActive ? 1.7 : 1);
  const brake = lowQuality ? 620 : highQuality ? 1_240 : 960;
  const passiveDrag = lowQuality ? 360 : highQuality ? 520 : 440;
  const maxSpeed = (lowQuality ? 260 : highQuality ? 760 : 620) * (boostActive ? 1.45 : 1);
  const headingResponse = lowQuality ? 9 : highQuality ? 18 : 14;
  const turnInput = clamp(
    input.moveX || (input.turnLeft ? -1 : 0) + (input.turnRight ? 1 : 0) + input.mouseTurn,
    -1,
    1,
  );
  const verticalInput = clamp(input.moveY || (input.accelerate ? 1 : 0) - (input.brake ? 1 : 0), -1, 1);

  const nextFlight = { ...flight };
  let velocityX = Math.cos(flight.heading) * flight.speed;
  let velocityY = Math.sin(flight.heading) * flight.speed;
  const inputMagnitude = Math.hypot(turnInput, verticalInput);

  if (inputMagnitude > 0.001) {
    const inputX = turnInput / inputMagnitude;
    const inputY = -verticalInput / inputMagnitude;
    velocityX += inputX * accel * dt;
    velocityY += inputY * accel * dt;
  } else {
    const speed = Math.hypot(velocityX, velocityY);
    const nextSpeed = Math.max(0, speed - passiveDrag * dt);
    const dragScale = speed > 0.001 ? nextSpeed / speed : 0;
    velocityX *= dragScale;
    velocityY *= dragScale;
  }

  if (input.brake && Math.abs(verticalInput) < 0.001) {
    const speed = Math.hypot(velocityX, velocityY);
    const nextSpeed = Math.max(0, speed - brake * dt);
    const brakeScale = speed > 0.001 ? nextSpeed / speed : 0;
    velocityX *= brakeScale;
    velocityY *= brakeScale;
  }

  const rawSpeed = Math.hypot(velocityX, velocityY);
  if (rawSpeed > maxSpeed) {
    const speedScale = maxSpeed / rawSpeed;
    velocityX *= speedScale;
    velocityY *= speedScale;
  }

  nextFlight.speed = clamp(Math.hypot(velocityX, velocityY), 0, maxSpeed);
  if (nextFlight.speed > 1) {
    const targetHeading = Math.atan2(velocityY, velocityX);
    let headingDelta = targetHeading - nextFlight.heading;
    while (headingDelta > Math.PI) headingDelta -= Math.PI * 2;
    while (headingDelta < -Math.PI) headingDelta += Math.PI * 2;
    const headingBlend = Math.min(1, headingResponse * dt);
    nextFlight.angVel += ((headingDelta / Math.max(dt, 0.001)) - nextFlight.angVel) * Math.min(1, turnResponse * dt);
    nextFlight.heading += headingDelta * headingBlend;
  } else {
    nextFlight.angVel *= Math.max(0, 1 - turnResponse * dt);
  }

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
