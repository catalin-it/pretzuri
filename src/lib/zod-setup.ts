import { z } from "zod";

// Zod 4 probes `new Function("")` once to decide whether it may JIT-compile object parsers. Our CSP forbids eval, so
// the (caught) probe was reported as a CSP violation on every page. jitless skips the probe; parsing stays identical.
// Imported first by the client root provider and by the env parser (which runs at module load).
z.config({ jitless: true });
