// Runs Vitest from a cwd with an upper-case Windows drive letter.
// VS Code terminals start in `c:\...`; Vitest then loads its runner twice (`c:` vs `C:`)
// and every suite fails at the first `describe` with
// "Cannot read properties of undefined (reading 'config')".
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const cli = join(cwd, "node_modules", "vitest", "vitest.mjs");
const { status } = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(status ?? 1);
