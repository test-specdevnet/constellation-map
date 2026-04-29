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
    path: "/models/biplane.glb",
    fallbackLabel: "procedural biplane",
    scale: 1,
    groundOffset: 0,
    rotationY: Math.PI,
    maxInstances: { low: 0, medium: 1, high: 1 },
  },
  floatingDrone: {
    id: "floatingDrone",
    path: "/models/floatingdrone.glb",
    fallbackLabel: "procedural deployment buoy",
    scale: 1,
    groundOffset: 0,
    rotationY: 0,
    maxInstances: { low: 0, medium: 4, high: 7 },
  },
  floatingUpgradeLab: {
    id: "floatingUpgradeLab",
    path: "/models/floatingupgradelab.glb",
    fallbackLabel: "procedural upgrade lab",
    scale: 1,
    groundOffset: 0,
    rotationY: 0,
    maxInstances: { low: 0, medium: 2, high: 3 },
  },
  refuelStation: {
    id: "refuelStation",
    path: "/models/refuelstation.glb",
    fallbackLabel: "procedural refuel station",
    scale: 1,
    groundOffset: 0,
    rotationY: 0,
    maxInstances: { low: 0, medium: 2, high: 3 },
  },
  serviceRobot: {
    id: "serviceRobot",
    path: "/models/servicerobot.glb",
    fallbackLabel: "procedural service robot",
    scale: 1,
    groundOffset: 0,
    rotationY: 0,
    maxInstances: { low: 0, medium: 3, high: 5 },
  },
};

export const getRuntimeModelConfig = (id: RuntimeModelId) => RUNTIME_MODEL_CONFIGS[id];

export const getModelInstanceBudget = (id: RuntimeModelId, qualityMode: "low" | "medium" | "high") =>
  RUNTIME_MODEL_CONFIGS[id].maxInstances[qualityMode];

export const getStationModelId = (kind: "refuel" | "upgrade"): RuntimeModelId =>
  kind === "refuel" ? "refuelStation" : "floatingUpgradeLab";
