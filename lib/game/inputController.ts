import { clamp } from "./config";
import type { FlightInputState } from "./types";

export type ControlKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Climb" | "Dive";

export type InputController = {
  pressed: Set<ControlKey>;
  sceneFocused: boolean;
  mouseSteerActive: boolean;
  pointerTurnBias: number;
};

export type InputSample = {
  flightInput: FlightInputState;
  turnAxis: number;
  throttleAxis: number;
  verticalAxis: number;
};

const POINTER_DEADZONE = 0.08;

export const createInputController = (): InputController => ({
  pressed: new Set<ControlKey>(),
  sceneFocused: false,
  mouseSteerActive: false,
  pointerTurnBias: 0,
});

export const focusInputController = (controller: InputController) => {
  controller.sceneFocused = true;
};

export const pressControlKey = (controller: InputController, key: ControlKey) => {
  controller.pressed.add(key);
};

export const releaseControlKey = (controller: InputController, key: ControlKey) => {
  controller.pressed.delete(key);
};

export const setMouseSteerActive = (controller: InputController, active: boolean) => {
  controller.mouseSteerActive = active;
  if (!active) {
    controller.pointerTurnBias = 0;
  }
};

export const setPointerTurnBias = (controller: InputController, normalizedX: number) => {
  controller.pointerTurnBias = clamp(normalizedX, -1, 1);
};

export const resetInputController = ({
  controller,
  blur = false,
}: {
  controller: InputController;
  blur?: boolean;
}) => {
  controller.pressed.clear();
  controller.mouseSteerActive = false;
  controller.pointerTurnBias = 0;
  if (blur) {
    controller.sceneFocused = false;
  }
};

export const sampleInputController = ({
  controller,
  mouseSensitivity,
}: {
  controller: InputController;
  mouseSensitivity: number;
}): InputSample => {
  const rawMouseTurn =
    controller.sceneFocused && controller.mouseSteerActive
      ? clamp(controller.pointerTurnBias * mouseSensitivity * 1.35, -1, 1)
      : 0;
  const mouseTurn = Math.abs(rawMouseTurn) < POINTER_DEADZONE ? 0 : rawMouseTurn;
  const turnAxis = clamp(
    (controller.pressed.has("ArrowRight") ? 1 : 0) -
      (controller.pressed.has("ArrowLeft") ? 1 : 0) +
      mouseTurn,
    -1,
    1,
  );
  const throttleAxis = clamp(
    (controller.pressed.has("ArrowUp") ? 1 : 0) -
      (controller.pressed.has("ArrowDown") ? 1 : 0),
    -1,
    1,
  );
  const verticalAxis = clamp(
    (controller.pressed.has("Climb") ? 1 : 0) -
      (controller.pressed.has("Dive") ? 1 : 0),
    -1,
    1,
  );

  return {
    flightInput: {
      accelerate: throttleAxis > 0,
      brake: throttleAxis < 0,
      turnLeft: turnAxis < 0,
      turnRight: turnAxis > 0,
      mouseTurn,
      moveX: turnAxis,
      moveY: throttleAxis,
      climb: verticalAxis > 0,
      dive: verticalAxis < 0,
      verticalAxis,
    },
    turnAxis,
    throttleAxis,
    verticalAxis,
  };
};
