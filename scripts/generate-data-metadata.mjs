import { execFileSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = resolve(projectRoot, "public/data/ttas.csv");
const metadataPath = resolve(projectRoot, "public/data/metadata.json");

let updatedAt = "";
try {
  updatedAt = execFileSync("git", ["log", "-1", "--format=%cs", "--", "public/data/ttas.csv"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
} catch {
  // File modification time is used when Git history is unavailable.
}

if (!updatedAt) updatedAt = (await stat(csvPath)).mtime.toISOString().slice(0, 10);

await mkdir(dirname(metadataPath), { recursive: true });
await writeFile(metadataPath, `${JSON.stringify({ updatedAt }, null, 2)}\n`, "utf8");
