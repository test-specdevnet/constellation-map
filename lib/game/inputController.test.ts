import {
  createInputController,
  focusInputController,
  pressControlKey,
  releaseControlKey,
  resetInputController,
  sampleInputController,
  setMouseSteerActive,
  setPointerTurnBias,
} from "./inputController";

describe("inputController", () => {
  it("stays neutral when idle", () => {
    const controller = createInputController();
    const sample = sampleInputController({
      controller,
      mouseSensitivity: 1,
    });

    expect(sample.turnAxis).toBe(0);
    expect(sample.throttleAxis).toBe(0);
  });

  it("only applies mouse steering while explicitly active", () => {
    const controller = createInputController();
    focusInputController(controller);
    setPointerTurnBias(controller, 0.8);

    expect(
      sampleInputController({
        controller,
        mouseSensitivity: 1,
      }).turnAxis,
    ).toBe(0);

    setMouseSteerActive(controller, true);
    expect(
      sampleInputController({
        controller,
        mouseSensitivity: 1,
      }).turnAxis,
    ).toBeGreaterThan(0);
  });

  it("clears pressed keys and pointer bias on blur/reset", () => {
    const controller = createInputController();
    focusInputController(controller);
    setMouseSteerActive(controller, true);
    setPointerTurnBias(controller, 1);
    pressControlKey(controller, "ArrowRight");

    resetInputController({ controller, blur: true });
    const sample = sampleInputController({
      controller,
      mouseSensitivity: 1,
    });

    expect(sample.turnAxis).toBe(0);
    expect(controller.sceneFocused).toBe(false);
  });

  it("maps key presses to axes and releases them cleanly", () => {
    const controller = createInputController();
    focusInputController(controller);
    pressControlKey(controller, "ArrowUp");
    pressControlKey(controller, "ArrowLeft");

    let sample = sampleInputController({
      controller,
      mouseSensitivity: 1,
    });
    expect(sample.throttleAxis).toBe(1);
    expect(sample.turnAxis).toBeLessThan(0);
    expect(sample.flightInput.moveY).toBe(1);
    expect(sample.flightInput.moveX).toBeLessThan(0);

    releaseControlKey(controller, "ArrowLeft");
    sample = sampleInputController({
      controller,
      mouseSensitivity: 1,
    });
    expect(sample.turnAxis).toBe(0);
  });
});
