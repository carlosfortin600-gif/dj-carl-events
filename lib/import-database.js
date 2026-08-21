const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function importDatabaseFromFile(db, sourcePath) {
  const absSource = path.resolve(sourcePath);
  if (!fs.existsSync(absSource)) {
    throw new Error("Fichier introuvable");
  }

  const testDb = new Database(absSource, { readonly: true });
  let eventCount = 0;
  try {
    eventCount = testDb
      .prepare("SELECT COUNT(*) AS n FROM events WHERE deleted_at IS NULL")
      .get().n;
  } finally {
    testDb.close();
  }

  const attachName = "import_src";
  const escaped = absSource.replace(/'/g, "''");

  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`ATTACH DATABASE '${escaped}' AS ${attachName}`);
    const tables = db
      .prepare(
        `SELECT name FROM ${attachName}.sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`
      )
      .all();

    const tx = db.transaction(() => {
      for (const { name } of tables) {
        const safe = `"${name.replace(/"/g, '""')}"`;
        db.exec(`DELETE FROM main.${safe}`);
        db.exec(`INSERT INTO main.${safe} SELECT * FROM ${attachName}.${safe}`);
      }
    });
    tx();
    db.exec(`DETACH DATABASE ${attachName}`);
  } catch (err) {
    try {
      db.exec(`DETACH DATABASE ${attachName}`);
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    db.pragma("foreign_keys = ON");
  }

  return eventCount;
}

module.exports = {
  importDatabaseFromFile
};
