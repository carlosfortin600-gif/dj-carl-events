const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

function resolveDataDir() {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) return fromEnv;

  const renderDisk = "/var/data";
  if (fs.existsSync(renderDisk)) {
    return renderDisk;
  }

  return path.join(__dirname, "data");
}

const DATA_DIR = resolveDataDir();
const DB_PATH = path.join(DATA_DIR, "djcarl.db");

function isPersistentStorage() {
  return DATA_DIR !== path.join(__dirname, "data");
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initDatabase() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name_1 TEXT NOT NULL,
      first_name_2 TEXT,
      last_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      venue TEXT,
      address TEXT,
      guest_count INTEGER,
      status TEXT NOT NULL DEFAULT 'a_completer',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS event_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      service_name TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wedding_questionnaires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL UNIQUE,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timeline_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      time TEXT,
      title TEXT NOT NULL,
      description TEXT,
      song_artist TEXT,
      song_title TEXT,
      dj_notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      artist TEXT,
      title TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dj_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_event ON timeline_items(event_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_songs_event ON songs(event_id, category, sort_order);

    CREATE TABLE IF NOT EXISTS event_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_event_files_event ON event_files(event_id, uploaded_at);
  `);

  migrate(db);
  return db;
}

function migrate(db) {
  const columns = db.prepare("PRAGMA table_info(events)").all().map((c) => c.name);

  if (!columns.includes("portal_token")) {
    db.exec("ALTER TABLE events ADD COLUMN portal_token TEXT");
  }
  if (!columns.includes("portal_enabled")) {
    db.exec("ALTER TABLE events ADD COLUMN portal_enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!columns.includes("portal_created_at")) {
    db.exec("ALTER TABLE events ADD COLUMN portal_created_at TEXT");
  }
  if (!columns.includes("portal_last_accessed")) {
    db.exec("ALTER TABLE events ADD COLUMN portal_last_accessed TEXT");
  }
  if (!columns.includes("deleted_at")) {
    db.exec("ALTER TABLE events ADD COLUMN deleted_at TEXT");
  }
  if (!columns.includes("quiz_musical_style")) {
    db.exec("ALTER TABLE events ADD COLUMN quiz_musical_style TEXT");
  }
  if (!columns.includes("bingo_musical_style")) {
    db.exec("ALTER TABLE events ADD COLUMN bingo_musical_style TEXT");
  }
  if (!columns.includes("on_connait_chanson_notes")) {
    db.exec("ALTER TABLE events ADD COLUMN on_connait_chanson_notes TEXT");
  }
  if (!columns.includes("animation_included")) {
    db.exec("ALTER TABLE events ADD COLUMN animation_included TEXT");
  }
  if (!columns.includes("animation_notes")) {
    db.exec("ALTER TABLE events ADD COLUMN animation_notes TEXT");
  }
  if (!columns.includes("venue_elevator")) {
    db.exec("ALTER TABLE events ADD COLUMN venue_elevator TEXT");
  }
  if (!columns.includes("route_origin_key")) {
    db.exec("ALTER TABLE events ADD COLUMN route_origin_key TEXT");
  }
  if (!columns.includes("route_origin_custom")) {
    db.exec("ALTER TABLE events ADD COLUMN route_origin_custom TEXT");
  }
  if (!columns.includes("end_date")) {
    db.exec("ALTER TABLE events ADD COLUMN end_date TEXT");
  }
  if (!columns.includes("confirmation_email_sent_at")) {
    db.exec("ALTER TABLE events ADD COLUMN confirmation_email_sent_at TEXT");
  }
  if (!columns.includes("client_confirmed_at")) {
    db.exec("ALTER TABLE events ADD COLUMN client_confirmed_at TEXT");
  }
  if (!columns.includes("client_confirmed_by_name")) {
    db.exec("ALTER TABLE events ADD COLUMN client_confirmed_by_name TEXT");
  }

  if (columns.includes("quiz_musical_style")) {
    db.exec(`
      UPDATE events
      SET bingo_musical_style = COALESCE(bingo_musical_style, quiz_musical_style)
      WHERE quiz_musical_style IS NOT NULL AND quiz_musical_style != ''
    `);
  }

  const needsServiceRename = db
    .prepare(
      `SELECT 1 FROM event_services
       WHERE service_name IN ('Quiz musical', 'Bingo musical')
       LIMIT 1`
    )
    .get();
  if (needsServiceRename) {
    db.exec(`
      UPDATE event_services SET service_name = '_bingo_old_'
      WHERE service_name = 'Bingo musical'
    `);
    db.exec(`
      UPDATE event_services SET service_name = 'Bingo musical'
      WHERE service_name = 'Quiz musical'
    `);
    db.exec(`
      UPDATE event_services SET service_name = 'On connaît la chanson'
      WHERE service_name = '_bingo_old_'
    `);
  }

  db.exec(`
    UPDATE event_services SET service_name = 'Uplight filaire'
    WHERE service_name = 'Uplight'
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_portal_token
    ON events(portal_token) WHERE portal_token IS NOT NULL
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_deleted ON events(deleted_at)
  `);

  const djNotesColumns = db.prepare("PRAGMA table_info(dj_notes)").all().map((c) => c.name);
  if (!djNotesColumns.includes("tech_departure_time")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_departure_time TEXT");
  }
  if (!djNotesColumns.includes("tech_trailer_start")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_trailer_start TEXT");
  }
  if (!djNotesColumns.includes("tech_trailer_end")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_trailer_end TEXT");
  }
  if (!djNotesColumns.includes("tech_departure_date")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_departure_date TEXT");
  }
  if (!djNotesColumns.includes("tech_arrival_date")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_arrival_date TEXT");
  }
  if (!djNotesColumns.includes("tech_arrival_time")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_arrival_time TEXT");
  }
  if (!djNotesColumns.includes("tech_room_location")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_room_location TEXT");
  }
  if (!djNotesColumns.includes("tech_room_date")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_room_date TEXT");
  }
  if (!djNotesColumns.includes("tech_room_start")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_room_start TEXT");
  }
  if (!djNotesColumns.includes("tech_room_end")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_room_end TEXT");
  }
  if (!djNotesColumns.includes("tech_trailer_start_time")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_trailer_start_time TEXT");
  }
  if (!djNotesColumns.includes("tech_trailer_end_time")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_trailer_end_time TEXT");
  }
  if (!djNotesColumns.includes("tech_room_start_time")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_room_start_time TEXT");
  }
  if (!djNotesColumns.includes("tech_room_end_time")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_room_end_time TEXT");
  }
  if (!djNotesColumns.includes("tech_trailer_needed")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_trailer_needed TEXT");
  }
  if (!djNotesColumns.includes("tech_room_needed")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_room_needed TEXT");
  }
  if (!djNotesColumns.includes("tech_room_price")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_room_price TEXT");
  }
  if (!djNotesColumns.includes("tech_charged_price")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_charged_price TEXT");
  }
  if (!djNotesColumns.includes("tech_client_called")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_client_called TEXT");
  }
  if (!djNotesColumns.includes("tech_client_call_date")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_client_call_date TEXT");
  }
  if (!djNotesColumns.includes("tech_client_call_time")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_client_call_time TEXT");
  }
  if (!djNotesColumns.includes("tech_callback_name")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_callback_name TEXT");
  }
  if (!djNotesColumns.includes("tech_callback_date")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_callback_date TEXT");
  }
  if (!djNotesColumns.includes("tech_callback_time")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_callback_time TEXT");
  }
  if (!djNotesColumns.includes("tech_questionnaire_sent")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_questionnaire_sent TEXT");
  }
  if (!djNotesColumns.includes("tech_questionnaire_sent_date")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_questionnaire_sent_date TEXT");
  }
  if (!djNotesColumns.includes("tech_questionnaire_sent_time")) {
    db.exec("ALTER TABLE dj_notes ADD COLUMN tech_questionnaire_sent_time TEXT");
  }

  db.exec(`
    UPDATE dj_notes
    SET tech_charged_price = tech_room_price
    WHERE (tech_charged_price IS NULL OR tech_charged_price = '')
      AND tech_room_price IS NOT NULL AND tech_room_price != ''
  `);

  db.exec(`
    UPDATE dj_notes
    SET tech_trailer_needed = 'yes'
    WHERE (
      (tech_trailer_start IS NOT NULL AND tech_trailer_start != '')
      OR (tech_trailer_end IS NOT NULL AND tech_trailer_end != '')
    )
    AND (tech_trailer_needed IS NULL OR tech_trailer_needed = '')
  `);
  db.exec(`
    UPDATE dj_notes
    SET tech_room_needed = 'yes'
    WHERE (
      (tech_room_location IS NOT NULL AND tech_room_location != '')
      OR (tech_room_start IS NOT NULL AND tech_room_start != '')
      OR (tech_room_end IS NOT NULL AND tech_room_end != '')
    )
    AND (tech_room_needed IS NULL OR tech_room_needed = '')
  `);

  db.exec(`
    UPDATE dj_notes
    SET tech_room_start = COALESCE(tech_room_start, tech_room_date)
    WHERE tech_room_date IS NOT NULL AND tech_room_date != ''
      AND (tech_room_start IS NULL OR tech_room_start = '')
  `);

  // Legacy: tech_departure_time without date → use event date
  db.exec(`
    UPDATE dj_notes
    SET tech_departure_date = (
      SELECT event_date FROM events WHERE events.id = dj_notes.event_id
    )
    WHERE tech_departure_time IS NOT NULL
      AND tech_departure_time != ''
      AND (tech_departure_date IS NULL OR tech_departure_date = '')
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS event_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_event_files_event ON event_files(event_id, uploaded_at)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS subcontractor_contracts (
      event_id INTEGER NOT NULL,
      subcontractor_id TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      PRIMARY KEY (event_id, subcontractor_id),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS subcontractor_calendar_tokens (
      subcontractor_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subcontractor_calendar_token
    ON subcontractor_calendar_tokens(access_token)
  `);

  const timelineReordered = db
    .prepare("SELECT value FROM app_meta WHERE key = 'timeline_reordered_by_time'")
    .get();
  if (!timelineReordered) {
    const { reorderAllTimelinesByTime } = require("./lib/timeline");
    reorderAllTimelinesByTime(db);
    db.prepare(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('timeline_reordered_by_time', '1')"
    ).run();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS portal_client_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      read_at TEXT,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_portal_client_notifications_unread
    ON portal_client_notifications(event_id, read_at, created_at)
  `);
}

module.exports = {
  initDatabase,
  DB_PATH,
  DATA_DIR,
  isPersistentStorage
};
