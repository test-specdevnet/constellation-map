import type { SceneBounds } from "../types/star";
import { GAME_CONFIG, clamp, type QualityMode } from "./config";
import type { FlightInputState, FlightState } from "./types";

export const createFlightState = (x: number, y: number): FlightState => ({
  x,
  y,
  heading: -Math.PI / 2,
  speed: 0,
  angVel: 0,
  altitude: GAME_CONFIG.altitudeDefault,
  verticalVelocity: 0,
  pitch: 0,
});

export const integrateFlightState = ({
  flight,
  input,
  bounds,
  dtMs,
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
  const baseTurnRate = 2.95;
  const turnResponse = 18;
  const accel = 920 * (boostActive ? 1.55 : 1);
  const brake = 1_080;
  const passiveDrag = 230;
  const maxSpeed = 760 * (boostActive ? 1.45 : 1);
  const turnInput = clamp(
    input.moveX || (input.turnLeft ? -1 : 0) + (input.turnRight ? 1 : 0) + input.mouseTurn,
    -1,
    1,
  );
  const verticalInput = clamp(input.moveY || (input.accelerate ? 1 : 0) - (input.brake ? 1 : 0), -1, 1);
  const climbInput = clamp(
    input.verticalAxis || (input.climb ? 1 : 0) - (input.dive ? 1 : 0),
    -1,
    1,
  );

  const nextFlight = { ...flight };
  nextFlight.altitude = flight.altitude ?? GAME_CONFIG.altitudeDefault;
  nextFlight.verticalVelocity = flight.verticalVelocity ?? 0;
  nextFlight.pitch = flight.pitch ?? 0;

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

  const climbAcceleration = GAME_CONFIG.climbAcceleration;
  nextFlight.verticalVelocity += climbInput * climbAcceleration * dt;
  nextFlight.verticalVelocity *= Math.exp(-GAME_CONFIG.verticalDrag * dt);
  nextFlight.verticalVelocity = clamp(
    nextFlight.verticalVelocity,
    -GAME_CONFIG.maxVerticalSpeed,
    GAME_CONFIG.maxVerticalSpeed,
  );
  nextFlight.altitude = clamp(
    nextFlight.altitude + nextFlight.verticalVelocity * dt,
    GAME_CONFIG.altitudeMin,
    GAME_CONFIG.altitudeMax,
  );
  if (
    (nextFlight.altitude <= GAME_CONFIG.altitudeMin && nextFlight.verticalVelocity < 0) ||
    (nextFlight.altitude >= GAME_CONFIG.altitudeMax && nextFlight.verticalVelocity > 0)
  ) {
    nextFlight.verticalVelocity = 0;
  }

  const targetPitch = clamp(
    climbInput * GAME_CONFIG.maxPitchRadians +
      (nextFlight.verticalVelocity / Math.max(GAME_CONFIG.maxVerticalSpeed, 1)) * 0.08,
    -GAME_CONFIG.maxPitchRadians,
    GAME_CONFIG.maxPitchRadians,
  );
  nextFlight.pitch += (targetPitch - nextFlight.pitch) * Math.min(1, 10 * dt);

  return nextFlight;
};

export const computeCameraFollowTarget = ({
  flight,
  qualityMode: _qualityMode,
}: {
  flight: FlightState;
  qualityMode: QualityMode;
}) => {
  const lookDistance = Math.min(480, flight.speed * 0.78);
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
