import {
  RUNTIME_MODEL_CONFIGS,
  getBiplaneMaterialRole,
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

  it("classifies biplane model materials for skin tinting", () => {
    expect(getBiplaneMaterialRole("UpperWing_L", "Paint")).toBe("wingHi");
    expect(getBiplaneMaterialRole("LowerWing_R", "Paint")).toBe("wing");
    expect(getBiplaneMaterialRole("Canopy", "Glass")).toBe("cockpit");
    expect(getBiplaneMaterialRole("FrontPropeller", "Wood")).toBe("prop");
    expect(getBiplaneMaterialRole("LandingGear", "Black")).toBe("trim");
    expect(getBiplaneMaterialRole("Fuselage", "Paint")).toBe("body");
  });
});
