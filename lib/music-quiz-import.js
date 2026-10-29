const fs = require("fs");
const path = require("path");

const BANK_FILE = path.join(__dirname, "..", "data", "music-quiz-bank.json");
const AUDIO_FOLDER = "music-quiz";

const REQUIRED_FIELDS = [
  "category",
  "title",
  "artist",
  "audioFile",
  "start",
  "duration",
  "choices",
  "correct"
];

function loadMusicQuizBank(filePath = BANK_FILE) {
  const target = filePath || BANK_FILE;

  if (!fs.existsSync(target)) {
    throw new Error(`Banque quiz musical introuvable : ${target}`);
  }

  const bank = JSON.parse(fs.readFileSync(target, "utf8"));
  const categories = normalizeBankCategories(bank);

  return {
    version: bank.version || 1,
    audioPath: bank.audioPath || AUDIO_FOLDER,
    categories
  };
}

function normalizeBankCategories(bank) {
  if (Array.isArray(bank.categories)) {
    return bank.categories.map((entry) => ({
      label: String(entry.label || entry.category || "").trim(),
      questions: Array.isArray(entry.questions) ? entry.questions : []
    }));
  }

  if (Array.isArray(bank.questions)) {
    const grouped = new Map();

    bank.questions.forEach((question) => {
      const label = String(question.category || "").trim();
      if (!label) return;

      if (!grouped.has(label)) {
        grouped.set(label, []);
      }

      grouped.get(label).push(question);
    });

    return Array.from(grouped.entries()).map(([label, questions]) => ({
      label,
      questions
    }));
  }

  throw new Error("Format de banque invalide : categories ou questions requis.");
}

function validateMusicQuestion(question, context = "") {
  if (!question || typeof question !== "object") {
    throw new Error(`${context}Question invalide.`);
  }

  REQUIRED_FIELDS.forEach((field) => {
    if (!(field in question)) {
      throw new Error(`${context}Champ manquant : ${field}.`);
    }
  });

  if (!Array.isArray(question.choices) || question.choices.length !== 4) {
    throw new Error(`${context}Le champ choices doit contenir exactement 4 réponses.`);
  }

  if (!question.choices.every((choice) => String(choice || "").trim())) {
    throw new Error(`${context}Chaque choix doit être rempli.`);
  }

  const correct = Number(question.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) {
    throw new Error(`${context}Le champ correct doit être 0, 1, 2 ou 3.`);
  }

  const start = Number(question.start);
  const duration = Number(question.duration);

  if (!Number.isFinite(start) || start < 0) {
    throw new Error(`${context}Le champ start doit être un nombre positif.`);
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`${context}Le champ duration doit être supérieur à 0.`);
  }
}

function formatChoice(title, artist) {
  return `${String(title).trim()} — ${String(artist).trim()}`;
}

function convertMusicQuestionToAppQuestion(question, audioPath = AUDIO_FOLDER) {
  validateMusicQuestion(question);

  const folder = String(audioPath || AUDIO_FOLDER).replace(/^\/+|\/+$/g, "");
  const audioFile = String(question.audioFile || "").trim().replace(/^\/+/, "");
  const duration = Number(question.duration) || 10;

  return {
    question: "Quelle est cette chanson ?",
    answers: question.choices.map((choice) => String(choice).trim()),
    correctAnswer: Number(question.correct),
    timer: Math.max(duration + 15, 30),
    audio: `${folder}/${audioFile}`,
    audioStart: Number(question.start) || 0,
    audioDuration: duration,
    category: String(question.category).trim(),
    musicTitle: String(question.title).trim(),
    musicArtist: String(question.artist).trim()
  };
}

function convertCategoryToQuiz(categoryLabel, questions, options = {}) {
  const label = String(categoryLabel || "").trim();
  const audioPath = options.audioPath || AUDIO_FOLDER;
  const title = String(options.title || `Quiz musical — ${label}`).trim();

  if (!label) {
    throw new Error("Nom de catégorie requis.");
  }

  if (!Array.isArray(questions) || questions.length !== 7) {
    throw new Error(`La catégorie « ${label} » doit contenir exactement 7 questions.`);
  }

  const converted = questions.map((question, index) => {
    try {
      return convertMusicQuestionToAppQuestion(question, audioPath);
    } catch (error) {
      throw new Error(`[${label} — question ${index + 1}] ${error.message}`);
    }
  });

  return {
    title,
    questions: converted
  };
}

function listMusicQuizCategories(filePath = BANK_FILE) {
  const bank = loadMusicQuizBank(filePath);

  return bank.categories.map((category) => ({
    label: category.label,
    questionCount: category.questions.length
  }));
}

function getMusicQuizCategory(categoryLabel, filePath = BANK_FILE) {
  const bank = loadMusicQuizBank(filePath);
  const label = String(categoryLabel || "").trim();
  const match = bank.categories.find((category) => category.label === label);

  if (!match) {
    throw new Error(`Catégorie introuvable : ${label}`);
  }

  return {
    label: match.label,
    questions: match.questions
  };
}

function buildMusicQuizImport(categoryLabel, options = {}) {
  const filePath = options.filePath || BANK_FILE;
  const category = getMusicQuizCategory(categoryLabel, filePath);
  const bank = loadMusicQuizBank(filePath);

  return convertCategoryToQuiz(category.label, category.questions, {
    title: options.title,
    audioPath: bank.audioPath
  });
}

module.exports = {
  BANK_FILE,
  AUDIO_FOLDER,
  REQUIRED_FIELDS,
  loadMusicQuizBank,
  validateMusicQuestion,
  formatChoice,
  convertMusicQuestionToAppQuestion,
  convertCategoryToQuiz,
  listMusicQuizCategories,
  getMusicQuizCategory,
  buildMusicQuizImport
};
