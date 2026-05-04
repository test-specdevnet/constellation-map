import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const modelDir = path.join(root, "public", "models");
const optimizedModelDir = path.join(root, "public", "models-optimized");
const runtimeModels = ["biplane.glb"];
const softSizeLimitBytes = 20 * 1024 * 1024;
const hardSizeLimitBytes = 75 * 1024 * 1024;
const optimizedSoftSizeLimitBytes = 5 * 1024 * 1024;

const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const readGlbHeader = async (filePath) => {
  const handle = await readFile(filePath);
  if (handle.byteLength < 12) {
    return { valid: false, reason: "file is shorter than the GLB header" };
  }

  const magic = handle.toString("utf8", 0, 4);
  const version = handle.readUInt32LE(4);
  const declaredLength = handle.readUInt32LE(8);
  if (magic !== "glTF") {
    return { valid: false, reason: `invalid GLB magic ${JSON.stringify(magic)}` };
  }
  if (version !== 2) {
    return { valid: false, reason: `unsupported GLB version ${version}` };
  }
  if (declaredLength !== handle.byteLength) {
    return {
      valid: false,
      reason: `declared length ${declaredLength} does not match file length ${handle.byteLength}`,
    };
  }
  return { valid: true };
};

const main = async () => {
  const failures = [];
  const warnings = [];

  try {
    await access(modelDir);
    const rawGlbs = (await readdir(modelDir)).filter((file) => file.endsWith(".glb"));
    if (rawGlbs.length > 0) {
      failures.push(`public/models contains runtime-disabled GLBs: ${rawGlbs.join(", ")}`);
    }
  } catch {
    warnings.push("public/models is missing; no raw GLBs are required for runtime");
  }

  try {
    const optimizedPresent = new Set(await readdir(optimizedModelDir));
    const optimizedGlbs = Array.from(optimizedPresent).filter((file) => file.endsWith(".glb"));
    const extraOptimizedGlbs = optimizedGlbs.filter((file) => !runtimeModels.includes(file));
    if (extraOptimizedGlbs.length > 0) {
      failures.push(
        `public/models-optimized contains non-runtime GLBs: ${extraOptimizedGlbs.join(", ")}`,
      );
    }

    for (const model of runtimeModels) {
      const filePath = path.join(optimizedModelDir, model);
      if (!optimizedPresent.has(model)) {
        failures.push(`${model}: missing from public/models-optimized`);
        continue;
      }
      const info = await stat(filePath);
      const header = await readGlbHeader(filePath);
      if (!header.valid) {
        failures.push(`optimized ${model}: ${header.reason}`);
        continue;
      }
      if (info.size > optimizedSoftSizeLimitBytes) {
        failures.push(
          `optimized ${model}: ${formatMb(info.size)} exceeds runtime limit ${formatMb(optimizedSoftSizeLimitBytes)}`,
        );
      } else if (info.size > hardSizeLimitBytes) {
        failures.push(
          `optimized ${model}: ${formatMb(info.size)} exceeds hard limit ${formatMb(hardSizeLimitBytes)}`,
        );
      } else if (info.size > softSizeLimitBytes) {
        warnings.push(
          `optimized ${model}: ${formatMb(info.size)} should be reduced when a smaller biplane export is available`,
        );
      }
      console.log(`ok optimized ${model} ${formatMb(info.size)}`);
    }
  } catch {
    failures.push("public/models-optimized is missing; keep the optimized biplane GLB checked in");
  }

  if (warnings.length > 0) {
    console.warn("\nAsset warnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nAsset audit failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
