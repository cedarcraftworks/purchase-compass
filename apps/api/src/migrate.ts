import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { migrate } from "./migrator.js";

const config = loadConfig();
const sql = createDb(config.DATABASE_URL, 1);

try {
  const applied = await migrate(sql);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
