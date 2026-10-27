// Records the demo data served by a running API (seeded with /samples) into
// public/demo, so the GitHub Pages build can show real analyzer output with
// no server. Usage: start the stack, then `node apps/web/scripts/snapshot-demo.mjs`.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const api = process.env.API_URL ?? "http://localhost:3000";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/demo");
await mkdir(out, { recursive: true });

for (const name of ["meta", "insights", "recommendations", "purchases"]) {
  const res = await fetch(`${api}/api/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  let data = await res.json();
  if (name === "meta") data = { ...data, demoMode: true };
  await writeFile(path.join(out, `${name}.json`), `${JSON.stringify(data)}\n`);
  console.log(`wrote ${name}.json`);
}
