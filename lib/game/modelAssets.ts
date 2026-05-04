export type RuntimeModelId = "biplane";

export type RuntimeModelConfig = {
  id: RuntimeModelId;
  path: string;
  fallbackLabel: string;
  scale: number;
  groundOffset: number;
  rotationY: number;
  maxInstances: {
    low: number;
    medium: number;
    high: number;
  };
};

export type BiplaneMaterialRole = "body" | "bodyHi" | "wing" | "wingHi" | "trim" | "cockpit" | "prop";

export const RUNTIME_MODEL_CONFIGS: Record<RuntimeModelId, RuntimeModelConfig> = {
  biplane: {
    id: "biplane",
    path: "/models-optimized/biplane.glb",
    fallbackLabel: "procedural biplane",
    scale: 6.4,
    groundOffset: 0,
    rotationY: 0,
    maxInstances: { low: 1, medium: 1, high: 1 },
  },
};

export const getRuntimeModelConfig = (id: RuntimeModelId) => RUNTIME_MODEL_CONFIGS[id];

export const getModelInstanceBudget = (id: RuntimeModelId, qualityMode: "low" | "medium" | "high") =>
  RUNTIME_MODEL_CONFIGS[id].maxInstances[qualityMode];

export const getBiplaneMaterialRole = (meshName: string, materialName: string): BiplaneMaterialRole => {
  const name = `${meshName} ${materialName}`.toLowerCase();
  if (/(glass|canopy|cockpit|window|windshield)/.test(name)) return "cockpit";
  if (/(prop|spinner|blade)/.test(name)) return "prop";
  if (/(wheel|tire|tyre|strut|gear|skid|wire|trim|frame|black)/.test(name)) return "trim";
  if (/(upper|top).*(wing)|wing.*(upper|top)/.test(name)) return "wingHi";
  if (/wing/.test(name)) return "wing";
  if (/(nose|engine|cowling|highlight|stripe)/.test(name)) return "bodyHi";
  return "body";
};
