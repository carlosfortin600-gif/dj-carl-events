#!/usr/bin/env node

const Database = require("better-sqlite3");
const path = require("path");
const {
  buildMusicQuizImport,
  listMusicQuizCategories
} = require("../lib/music-quiz-import");

const dbPath = path.join(__dirname, "..", "quiz.db");
const args = process.argv.slice(2);

function printHelp() {
  console.log(`
Importe une catégorie du quiz musical dans un dossier.

Usage:
  node scripts/import-music-quiz.js <catégorie> <groupId> [titre]

Exemples:
  node scripts/import-music-quiz.js "Francophone" 1
  node scripts/import-music-quiz.js "Années 80" 1 "Blind test 80s"

Catégories disponibles:
${listMusicQuizCategories().map((item) => `  - ${item.label} (${item.questionCount} questions)`).join("\n")}
`);
}

if (!args.length || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(args.length ? 0 : 1);
}

const category = args[0];
const groupId = Number(args[1]);
const title = args[2] || "";

if (!Number.isFinite(groupId)) {
  console.error("Erreur : groupId invalide.");
  printHelp();
  process.exit(1);
}

try {
  const parsed = buildMusicQuizImport(category, { title: title || undefined });
  const db = new Database(dbPath);

  const group = db.prepare("SELECT id, name FROM quiz_groups WHERE id = ?").get(groupId);
  if (!group) {
    throw new Error(`Dossier introuvable (id ${groupId}).`);
  }

  const nextOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS value
    FROM quizzes
    WHERE group_id = ?
  `).get(groupId).value;

  const result = db.prepare(`
    INSERT INTO quizzes (title, data, group_id, sort_order)
    VALUES (?, ?, ?, ?)
  `).run(
    parsed.title,
    JSON.stringify(parsed),
    groupId,
    nextOrder
  );

  console.log(`Quiz importé : ${parsed.title}`);
  console.log(`Dossier : ${group.name} (#${group.id})`);
  console.log(`Questions : ${parsed.questions.length}`);
  console.log(`ID quiz : ${result.lastInsertRowid}`);
} catch (error) {
  console.error(`Erreur : ${error.message}`);
  process.exit(1);
}
