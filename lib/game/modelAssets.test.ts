import {
  RUNTIME_MODEL_CONFIGS,
  getModelInstanceBudget,
  getBiplaneMaterialRole,
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
    expect(getModelInstanceBudget("floatingDrone", "low")).toBe(0);
    expect(getModelInstanceBudget("floatingDrone", "high")).toBe(0);
    expect(getModelInstanceBudget("refuelStation", "high")).toBe(0);
    expect(getModelInstanceBudget("serviceRobot", "high")).toBe(0);
    expect(getModelInstanceBudget("biplane", "high")).toBeGreaterThan(0);
  });

  it("resolves station kinds to model IDs", () => {
    expect(getStationModelId()).toBe("refuelStation");
    expect(getRuntimeModelConfig(getStationModelId()).path).toContain("refuelstation");
  });

  it("classifies biplane materials for skin tinting", () => {
    expect(getBiplaneMaterialRole("upper_wing", "paint")).toBe("wingHi");
    expect(getBiplaneMaterialRole("lower wing", "paint")).toBe("wing");
    expect(getBiplaneMaterialRole("wheel strut", "black")).toBe("trim");
    expect(getBiplaneMaterialRole("propeller", "blade")).toBe("prop");
    expect(getBiplaneMaterialRole("canopy", "glass")).toBe("cockpit");
    expect(getBiplaneMaterialRole("fuselage", "paint")).toBe("body");
  });
});
