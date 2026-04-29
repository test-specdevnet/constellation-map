import { mkdir, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const rawDir = path.join(root, "public", "models");
const optimizedDir = path.join(root, "public", "models-optimized");

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
    child.on("error", reject);
  });

const findGltfTransformCommand = () => process.env.GLTF_TRANSFORM_BIN || "gltf-transform";

const main = async () => {
  await mkdir(optimizedDir, { recursive: true });
  const files = (await readdir(rawDir)).filter((file) => file.endsWith(".glb"));
  if (files.length === 0) {
    throw new Error(`No .glb files found in ${rawDir}`);
  }

  const command = findGltfTransformCommand();
  console.log(`Optimizing ${files.length} GLB assets with ${command}`);
  console.log("Install @gltf-transform/cli or set GLTF_TRANSFORM_BIN if this command is unavailable.");

  for (const file of files) {
    const input = path.join(rawDir, file);
    const base = path.basename(file, ".glb");
    const output = path.join(optimizedDir, `${base}.glb`);

    await run(command, [
      "optimize",
      input,
      output,
      "--compress",
      "quantize",
      "--texture-compress",
      "webp",
      "--texture-size",
      "1024",
    ]);
    console.log(`optimized ${file} -> ${path.relative(root, output)}`);
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
