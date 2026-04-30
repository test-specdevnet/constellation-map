import {
  RUNTIME_MODEL_CONFIGS,
  getModelInstanceBudget,
  getRuntimeModelConfig,
  getStationModelId,
} from "./modelAssets";

describe("modelAssets", () => {
  it("maps every runtime model to a public GLB path and fallback label", () => {
    for (const config of Object.values(RUNTIME_MODEL_CONFIGS)) {
      expect(config.path).toMatch(/^\/models-optimized\/.+\.glb$/);
      expect(config.fallbackLabel.length).toBeGreaterThan(0);
      expect(config.maxInstances.low).toBeLessThanOrEqual(config.maxInstances.medium);
      expect(config.maxInstances.medium).toBeLessThanOrEqual(config.maxInstances.high);
    }
  });

  it("returns quality-aware model budgets", () => {
    expect(getModelInstanceBudget("floatingDrone", "low")).toBeGreaterThan(0);
    expect(getModelInstanceBudget("floatingDrone", "high")).toBeGreaterThan(
      getModelInstanceBudget("floatingDrone", "medium"),
    );
  });

  it("resolves station kinds to model IDs", () => {
    expect(getStationModelId()).toBe("refuelStation");
    expect(getRuntimeModelConfig(getStationModelId()).path).toContain("refuelstation");
  });
});
