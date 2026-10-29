const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const TEMPLATE_FILE = path.join(
  __dirname,
  "..",
  "templates",
  "DJ_Carl_Quiz_Modele_Client_Deluxe.xlsx"
);

const VALID_TIMERS = new Set([10, 15, 20, 25, 30, 45, 60, 90, 120]);

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ");
}

function parseCorrectAnswer(value) {
  const clean = String(value ?? "").trim().toUpperCase();

  if (["A", "0"].includes(clean)) return 0;
  if (["B", "1"].includes(clean)) return 1;
  if (["C", "2"].includes(clean)) return 2;
  if (["D", "3"].includes(clean)) return 3;

  return null;
}

function parseTimer(value) {
  const timer = Math.round(Number(value));

  if (!Number.isFinite(timer) || timer <= 0) {
    return 30;
  }

  return Math.min(600, Math.max(1, timer));
}

function findColumnIndex(headerRow, aliases) {
  for (let index = 0; index < headerRow.length; index += 1) {
    const header = normalizeText(headerRow[index]);
    if (aliases.some((alias) => header === alias || header.includes(alias))) {
      return index;
    }
  }

  return -1;
}

function getSheetRows(workbook, sheetName) {
  if (!sheetName || !workbook.Sheets[sheetName]) {
    return [];
  }

  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: ""
  });
}

function findQuestionsSheetName(workbook) {
  const preferred = workbook.SheetNames.find((name) => {
    const normalized = normalizeText(name);
    return normalized === "questions" || normalized === "quiz";
  });

  return preferred || workbook.SheetNames[0];
}

function locateQuestionTable(rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const headerRow = rows[index] || [];
    const questionCol = findColumnIndex(headerRow, ["question"]);
    const correctCol = findColumnIndex(headerRow, [
      "bonne reponse",
      "reponse correcte",
      "correct"
    ]);

    if (questionCol >= 0 && correctCol >= 0) {
      return {
        headerRow,
        headerRowIndex: index,
        dataStartIndex: index + 1
      };
    }
  }

  throw new Error(
    "Feuille Questions introuvable. Utilise le modèle DJ Carl Quiz Client Deluxe."
  );
}

function readAccueilTitle(workbook) {
  const rows = getSheetRows(workbook, "Accueil");
  if (!rows.length) return "";

  for (const row of rows) {
    const label = normalizeText(row[0]);

    if (
      label.includes("nom de l evenement") ||
      label.includes("nom evenement") ||
      label === "evenement"
    ) {
      return String(row[1] ?? "").trim();
    }
  }

  return "";
}

function readLegacyTitleRow(rows) {
  const firstCell = normalizeText(rows[0]?.[0]);

  if (firstCell.includes("titre")) {
    return String(rows[0]?.[1] || "").trim();
  }

  return "";
}

function parseQuizWorkbook(buffer, options = {}) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = findQuestionsSheetName(workbook);

  if (!sheetName) {
    throw new Error("Le fichier Excel est vide.");
  }

  const rows = getSheetRows(workbook, sheetName);

  if (!rows.length) {
    throw new Error("La feuille Questions ne contient aucune ligne.");
  }

  const { headerRow, dataStartIndex } = locateQuestionTable(rows);
  let title = String(options.title || "").trim();

  if (!title) {
    title = readAccueilTitle(workbook) || readLegacyTitleRow(rows);
  }

  if (!title) {
    const normalizedSheet = normalizeText(sheetName);
    if (normalizedSheet && normalizedSheet !== "questions" && normalizedSheet !== "quiz") {
      title = String(sheetName).trim();
    }
  }

  if (!title) {
    title = String(options.fallbackTitle || "Quiz importé").trim();
  }

  const columns = {
    question: findColumnIndex(headerRow, ["question"]),
    a: findColumnIndex(headerRow, ["reponse a", "choix a", "option a"]),
    b: findColumnIndex(headerRow, ["reponse b", "choix b", "option b"]),
    c: findColumnIndex(headerRow, ["reponse c", "choix c", "option c"]),
    d: findColumnIndex(headerRow, ["reponse d", "choix d", "option d"]),
    correct: findColumnIndex(headerRow, [
      "bonne reponse",
      "reponse correcte",
      "correct"
    ]),
    timer: findColumnIndex(headerRow, [
      "temps",
      "duree",
      "duree secondes",
      "timer",
      "timer secondes"
    ]),
    category: findColumnIndex(headerRow, ["categorie", "category"]),
    image: findColumnIndex(headerRow, ["image"]),
    audio: findColumnIndex(headerRow, ["audio"]),
    video: findColumnIndex(headerRow, ["video"]),
    difficulty: findColumnIndex(headerRow, ["difficulte", "difficulty"]),
    notes: findColumnIndex(headerRow, ["notes", "note"])
  };

  const questions = [];

  for (let rowIndex = dataStartIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const question = String(row[columns.question] ?? "").trim();
    const answerA = String(row[columns.a] ?? "").trim();
    const answerB = String(row[columns.b] ?? "").trim();
    const answerC = String(row[columns.c] ?? "").trim();
    const answerD = String(row[columns.d] ?? "").trim();
    const correctAnswer = parseCorrectAnswer(row[columns.correct]);
    const timer = columns.timer >= 0 ? parseTimer(row[columns.timer]) : 30;

    const hasContent = [question, answerA, answerB, answerC, answerD].some(Boolean);
    if (!hasContent) continue;

    if (!question || !answerA || !answerB || !answerC || !answerD) {
      throw new Error(
        `Ligne ${rowIndex + 1} incomplète : remplis la question et les 4 réponses.`
      );
    }

    if (correctAnswer === null) {
      throw new Error(
        `Ligne ${rowIndex + 1} : la bonne réponse doit être A, B, C ou D.`
      );
    }

    const questionData = {
      question,
      answers: [answerA, answerB, answerC, answerD],
      correctAnswer,
      timer,
      temps: timer
    };

    const category =
      columns.category >= 0 ? String(row[columns.category] ?? "").trim() : "";
    const image = columns.image >= 0 ? String(row[columns.image] ?? "").trim() : "";
    const audio = columns.audio >= 0 ? String(row[columns.audio] ?? "").trim() : "";
    const video = columns.video >= 0 ? String(row[columns.video] ?? "").trim() : "";
    const notes = columns.notes >= 0 ? String(row[columns.notes] ?? "").trim() : "";
    const difficultyRaw =
      columns.difficulty >= 0 ? String(row[columns.difficulty] ?? "").trim() : "";
    const difficulty = Number(difficultyRaw);

    if (category) questionData.category = category;
    if (image) questionData.image = image;
    if (audio) questionData.audio = audio;
    if (video) questionData.video = video;
    if (notes) questionData.notes = notes;
    if (Number.isFinite(difficulty) && difficulty > 0) {
      questionData.difficulty = difficulty;
    }

    questions.push(questionData);
  }

  if (questions.length === 0) {
    throw new Error("Aucune question valide trouvée dans la feuille Questions.");
  }

  return {
    title,
    questions
  };
}

function buildQuizTemplateBuffer() {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    throw new Error("Modèle Excel introuvable sur le serveur.");
  }

  return fs.readFileSync(TEMPLATE_FILE);
}

module.exports = {
  TEMPLATE_FILE,
  buildQuizTemplateBuffer,
  parseQuizWorkbook
};
