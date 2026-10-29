const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// Création du dossier data s'il n'existe pas
const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Ouverture de la base
const db = new Database(path.join(dataDir, "quiz.db"));

// Optimisations SQLite
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// =========================
// TABLE QUIZ
// =========================

db.prepare(`
CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    time_per_question INTEGER DEFAULT 20,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

// =========================
// TABLE QUESTIONS
// =========================

db.prepare(`
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    question_text TEXT NOT NULL,

    answer_a TEXT NOT NULL,
    answer_b TEXT NOT NULL,
    answer_c TEXT NOT NULL,
    answer_d TEXT NOT NULL,

    correct_answer TEXT NOT NULL,

    question_order INTEGER NOT NULL,

    image TEXT DEFAULT NULL,
    audio TEXT DEFAULT NULL,
    video TEXT DEFAULT NULL,

    FOREIGN KEY (quiz_id)
        REFERENCES quizzes(id)
        ON DELETE CASCADE
)
`).run();

// =========================
// TABLE SCORES
// =========================

db.prepare(`
CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER,
    player_name TEXT,
    score INTEGER DEFAULT 0,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

module.exports = { db };