import {
  RUNTIME_MODEL_CONFIGS,
  getModelInstanceBudget,
  getBiplaneMaterialRole,
  getRuntimeModelConfig,
} from "./modelAssets";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

  it("keeps only the optimized biplane GLB in public assets", () => {
    const modelDirs = ["public/models", "public/models-optimized"];
    const glbs = modelDirs.flatMap((dir) =>
      existsSync(join(process.cwd(), dir))
        ? readdirSync(join(process.cwd(), dir), { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith(".glb"))
            .map((entry) => `${dir}/${entry.name}`)
        : [],
    );

    expect(glbs).toEqual(["public/models-optimized/biplane.glb"]);
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
