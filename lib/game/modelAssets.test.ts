import {
  RUNTIME_MODEL_CONFIGS,
  getModelInstanceBudget,
  getBiplaneMaterialRole,
  getRuntimeModelConfig,
} from "./modelAssets";

describe("modelAssets", () => {
  it("maps every runtime model to a public GLB path and fallback label", () => {
    expect(Object.keys(RUNTIME_MODEL_CONFIGS)).toEqual(["biplane"]);
    for (const config of Object.values(RUNTIME_MODEL_CONFIGS)) {
      expect(config.path).toMatch(/^\/models-optimized\/.+\.glb$/);
      expect(config.fallbackLabel.length).toBeGreaterThan(0);
      expect(config.maxInstances.low).toBeLessThanOrEqual(config.maxInstances.medium);
      expect(config.maxInstances.medium).toBeLessThanOrEqual(config.maxInstances.high);
    }
  });

  it("returns quality-aware model budgets", () => {
    expect(getRuntimeModelConfig("biplane").path).toContain("biplane");
    expect(getModelInstanceBudget("biplane", "low")).toBeGreaterThan(0);
    expect(getModelInstanceBudget("biplane", "high")).toBeGreaterThan(0);
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
