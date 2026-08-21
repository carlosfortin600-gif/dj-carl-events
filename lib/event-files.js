const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { DATA_DIR } = require("../database");

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;

function getEventUploadDir(eventId) {
  const dir = path.join(DATA_DIR, "uploads", String(eventId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeOriginalName(name) {
  const base = path.basename(String(name || "fichier").replace(/[\0\r\n]/g, ""));
  return base.slice(0, 200) || "fichier";
}

function createUploadMiddleware(eventId) {
  return multer({
    storage: multer.diskStorage({
      destination(_req, _file, cb) {
        cb(null, getEventUploadDir(eventId));
      },
      filename(_req, file, cb) {
        const ext = path.extname(sanitizeOriginalName(file.originalname));
        const token = crypto.randomBytes(8).toString("hex");
        cb(null, `${Date.now()}-${token}${ext}`);
      }
    }),
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_UPLOAD }
  });
}

function getEventFiles(db, eventId) {
  return db
    .prepare(
      `SELECT id, original_name, stored_name, mime_type, size_bytes, uploaded_at
       FROM event_files
       WHERE event_id = ?
       ORDER BY uploaded_at DESC, id DESC`
    )
    .all(eventId);
}

function getEventFileById(db, fileId, eventId) {
  return db
    .prepare(
      `SELECT id, event_id, original_name, stored_name, mime_type, size_bytes, uploaded_at
       FROM event_files
       WHERE id = ? AND event_id = ?`
    )
    .get(fileId, eventId);
}

function getStoredFilePath(eventId, storedName) {
  const safeName = path.basename(storedName);
  return path.join(getEventUploadDir(eventId), safeName);
}

function saveUploadedFiles(db, eventId, files) {
  const insert = db.prepare(
    `INSERT INTO event_files (event_id, original_name, stored_name, mime_type, size_bytes)
     VALUES (?, ?, ?, ?, ?)`
  );

  const tx = db.transaction((uploaded) => {
    for (const file of uploaded) {
      insert.run(
        eventId,
        sanitizeOriginalName(file.originalname),
        path.basename(file.filename),
        file.mimetype || null,
        file.size || 0
      );
    }
  });
  tx(files);
}

function deleteEventFile(db, fileId, eventId) {
  const row = getEventFileById(db, fileId, eventId);
  if (!row) return false;

  const filePath = getStoredFilePath(eventId, row.stored_name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  db.prepare("DELETE FROM event_files WHERE id = ? AND event_id = ?").run(fileId, eventId);
  return true;
}

function deleteAllEventFiles(db, eventId) {
  const files = getEventFiles(db, eventId);
  for (const file of files) {
    const filePath = getStoredFilePath(eventId, file.stored_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  db.prepare("DELETE FROM event_files WHERE event_id = ?").run(eventId);

  const dir = path.join(DATA_DIR, "uploads", String(eventId));
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

module.exports = {
  MAX_FILE_SIZE,
  MAX_FILES_PER_UPLOAD,
  createUploadMiddleware,
  getEventFiles,
  getEventFileById,
  getStoredFilePath,
  saveUploadedFiles,
  deleteEventFile,
  deleteAllEventFiles,
  formatFileSize
};
