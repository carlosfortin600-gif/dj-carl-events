#!/usr/bin/env node
/**
 * Prepare a clean SQLite file to upload to Render (no WAL sidecar files).
 * Output: dist/djcarl-upload.db
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const root = path.join(__dirname, "..");
const source = path.join(root, "data", "djcarl.db");
const outDir = path.join(root, "dist");
const output = path.join(outDir, "djcarl-upload.db");

if (!fs.existsSync(source)) {
  console.error("Base locale introuvable :", source);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(output)) fs.unlinkSync(output);

const db = new Database(source);
db.pragma("wal_checkpoint(FULL)");
db.backup(output)
  .then(() => {
    db.close();
    const stats = fs.statSync(output);
    const events = new Database(output, { readonly: true })
      .prepare(
        `SELECT COUNT(*) AS n FROM events WHERE deleted_at IS NULL`
      )
      .get().n;

    console.log("");
    console.log("Fichier prêt :", output);
    console.log("Taille :", Math.round(stats.size / 1024) + " Ko");
    console.log("Événements inclus :", events);
    console.log("");
    console.log("Prochaine étape — voir DEPLOIEMENT.md section « Importer vos données »");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
