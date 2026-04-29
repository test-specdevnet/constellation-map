export type RuntimeModelId =
  | "biplane"
  | "floatingDrone"
  | "floatingUpgradeLab"
  | "refuelStation"
  | "serviceRobot";

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

export const RUNTIME_MODEL_CONFIGS: Record<RuntimeModelId, RuntimeModelConfig> = {
  biplane: {
    id: "biplane",
    path: "/models-optimized/biplane.glb",
    fallbackLabel: "procedural biplane",
    scale: 6.4,
    groundOffset: 0,
    rotationY: -Math.PI / 2,
    maxInstances: { low: 1, medium: 1, high: 1 },
  },
  floatingDrone: {
    id: "floatingDrone",
    path: "/models-optimized/floatingdrone.glb",
    fallbackLabel: "procedural deployment buoy",
    scale: 3.2,
    groundOffset: 0,
    rotationY: 0,
    maxInstances: { low: 4, medium: 8, high: 12 },
  },
  floatingUpgradeLab: {
    id: "floatingUpgradeLab",
    path: "/models-optimized/floatingupgradelab.glb",
    fallbackLabel: "procedural upgrade lab",
    scale: 9.5,
    groundOffset: 0,
    rotationY: 0,
    maxInstances: { low: 1, medium: 1, high: 2 },
  },
  refuelStation: {
    id: "refuelStation",
    path: "/models-optimized/refuelstation.glb",
    fallbackLabel: "procedural refuel station",
    scale: 9.5,
    groundOffset: 0,
    rotationY: 0,
    maxInstances: { low: 1, medium: 1, high: 2 },
  },
  serviceRobot: {
    id: "serviceRobot",
    path: "/models-optimized/servicerobot.glb",
    fallbackLabel: "procedural service robot",
    scale: 2.2,
    groundOffset: 0,
    rotationY: 0,
    maxInstances: { low: 1, medium: 2, high: 3 },
  },
};

export const getRuntimeModelConfig = (id: RuntimeModelId) => RUNTIME_MODEL_CONFIGS[id];

export const getModelInstanceBudget = (id: RuntimeModelId, qualityMode: "low" | "medium" | "high") =>
  RUNTIME_MODEL_CONFIGS[id].maxInstances[qualityMode];

export const getStationModelId = (kind: "refuel" | "upgrade"): RuntimeModelId =>
  kind === "refuel" ? "refuelStation" : "floatingUpgradeLab";
