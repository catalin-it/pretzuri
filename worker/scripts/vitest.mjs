// Runs vitest from the worker folder with an upper-case drive letter. On Windows, `npm --prefix worker test` starts
// with cwd "c:\..." while modules resolve under "C:\...", which loads two vitest instances ("reading 'config'").
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..").replace(/^[a-z]:/, (d) => d.toUpperCase());
const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
process.exit(r.status ?? 1);
