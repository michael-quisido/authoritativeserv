import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "userauth",
  password: process.env.DB_PASS || "passuserauth77",
  database: process.env.DB_NAME || "authnamedb",
};

const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
for (const file of fs.readdirSync(path.join(root, "migrations")).sort()) {
  if (!file.endsWith(".sql")) continue;
  const sql = fs.readFileSync(path.join(root, "migrations", file), "utf8");
  await conn.query(sql);
  console.log(`applied ${file}`);
}
await conn.end();
