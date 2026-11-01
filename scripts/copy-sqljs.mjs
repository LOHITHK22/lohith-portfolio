// Copies the pinned sql.js build into public/sqljs so the SQL Detective worker can load it
// from this site without a CDN. Run after upgrading the sql.js devDependency.
import { copyFileSync, readFileSync } from "node:fs";

const from = "node_modules/sql.js";
const to = "public/sqljs";
for (const file of ["dist/sql-wasm.js", "dist/sql-wasm.wasm", "LICENSE"]) {
  copyFileSync(`${from}/${file}`, `${to}/${file === "LICENSE" ? "LICENSE.txt" : file.split("/").pop()}`);
}
const { version } = JSON.parse(readFileSync(`${from}/package.json`, "utf8"));
console.log(`Copied sql.js ${version} to ${to}`);
