// Runs a TypeScript script through Vite's module runner, so scripts resolve imports and
// import.meta.env exactly like the app does. Usage: node scripts/run.mjs scripts/eval.ts
import { runnerImport } from "vite";

await runnerImport(new URL(`../${process.argv[2]}`, import.meta.url).pathname, { logLevel: "warn" });
