import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool, closePool } from "./pool.js";

const migrationFiles = ["001_initial.sql"];

async function migrate() {
  for (const file of migrationFiles) {
    const sql = await readFile(resolve("migrations", file), "utf8");
    await pool.query(sql);
    console.log(`applied ${file}`);
  }
}

migrate()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);
