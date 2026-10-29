const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const TEMPLATE_NUMBERS_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "DJ_Carl_Roue_Modele.numbers"
);

const IGNORED_SHEET_ALIASES = [
  "resume",
  "exportation",
  "summary",
  "export"
];

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ");
}

function isIgnoredSheetName(sheetName) {
  const normalized = normalizeText(sheetName);
  return IGNORED_SHEET_ALIASES.some((alias) => normalized.includes(alias));
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

function findSheetName(workbook, aliases) {
  const normalizedAliases = aliases.map((alias) => normalizeText(alias));

  return workbook.SheetNames.find((name) => {
    if (isIgnoredSheetName(name)) return false;

    const normalized = normalizeText(name);
    return normalizedAliases.some((alias) => normalized === alias || normalized.includes(alias));
  });
}

function sheetToRows(workbook, sheetName) {
  if (!sheetName) return [];

  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: ""
  });
}

function getFirstNonEmptyCell(row) {
  if (!Array.isArray(row)) return "";

  for (let index = 0; index < row.length; index += 1) {
    const value = String(row[index] ?? "").trim();
    if (value) return value;
  }

  return "";
}

function isSkippableNomLabel(label) {
  const normalized = normalizeText(label);
  if (!normalized) return true;

  return [
    "nom",
    "noms",
    "name",
    "names",
    "tableau 1",
    "tableau1",
    "joueur",
    "participant"
  ].includes(normalized);
}

function looksLikeNomHeaderRow(row) {
  return findColumnIndex(row, ["nom", "name", "joueur", "participant", "gagnant"]) >= 0;
}

function looksLikePrixHeaderRow(row) {
  const prizeIndex = findColumnIndex(row, ["prix en jeu", "prix", "price", "lot", "gain", "montant", "recompense"]);
  const countIndex = findColumnIndex(row, ["quantite restante", "quantite", "qte", "nombre", "count", "qty", "tirages", "fois", "nom"]);
  return prizeIndex >= 0 && countIndex >= 0;
}

function parseNomSheet(rows) {
  if (!rows.length) {
    throw new Error('La feuille "nom" est vide.');
  }

  let startRow = 0;
  let nameCol = 0;

  if (looksLikeNomHeaderRow(rows[0])) {
    nameCol = findColumnIndex(rows[0], ["nom", "name", "joueur", "participant", "gagnant"]);
    if (nameCol < 0) nameCol = 0;
    startRow = 1;
  }

  const entries = [];

  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const label = String(row[nameCol] ?? "").trim() || getFirstNonEmptyCell(row);
    if (!label || isSkippableNomLabel(label)) continue;
    entries.push({ label });
  }

  if (entries.length < 2) {
    throw new Error('La feuille "nom" doit contenir au moins 2 noms.');
  }

  if (entries.length > 24) {
    throw new Error('Maximum 24 noms dans la feuille "nom".');
  }

  return entries;
}

function parseCountValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 0;
  }

  return parsed;
}

function isSkippablePrixRow(prize, count, row) {
  const prizeNorm = normalizeText(prize);
  if (!prizeNorm) return true;
  if (prizeNorm === "prix" || prizeNorm === "tableau 1" || prizeNorm === "tableau1") return true;

  const rowText = normalizeText(row.map((cell) => String(cell ?? "")).join(" "));
  if (rowText.includes("resume") || rowText.includes("exportation")) return true;

  return false;
}

function parsePrixSheet(rows) {
  if (!rows.length) {
    throw new Error('La feuille "prix" est vide.');
  }

  let startRow = 0;
  let prizeCol = 0;
  let countCol = 1;

  if (looksLikePrixHeaderRow(rows[0])) {
    prizeCol = findColumnIndex(rows[0], ["prix en jeu", "prix", "price", "lot", "gain", "montant", "recompense"]);
    countCol = findColumnIndex(rows[0], ["quantite restante", "quantite", "qte", "nombre", "count", "qty", "tirages", "fois", "nom"]);

    if (prizeCol < 0) prizeCol = 0;
    if (countCol < 0) countCol = prizeCol === 0 ? 1 : 0;

    startRow = 1;
  }

  const prizeQueue = [];

  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const prize = String(row[prizeCol] ?? "").trim() || getFirstNonEmptyCell(row);
    const count = parseCountValue(row[countCol]);

    if (isSkippablePrixRow(prize, count, row)) continue;

    if (count < 1) {
      throw new Error(`Ligne ${rowIndex + 1} de la feuille "prix" : le nombre de tirages doit être au moins 1.`);
    }

    prizeQueue.push({
      prize,
      total: count,
      remaining: count
    });
  }

  if (prizeQueue.length < 1) {
    throw new Error('La feuille "prix" doit contenir au moins une ligne (prix + nombre de tirages).');
  }

  return prizeQueue;
}

function parseWheelWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const nomSheetName = findSheetName(workbook, ["nom", "noms", "names", "modele", "joueurs"]);
  const prixSheetName = findSheetName(workbook, ["prix en jeu", "prix", "prizes", "lots"]);

  if (!nomSheetName) {
    throw new Error('Feuille "nom" introuvable dans le fichier (nom, noms, modèle).');
  }

  if (!prixSheetName) {
    throw new Error('Feuille "prix" introuvable dans le fichier.');
  }

  const entries = parseNomSheet(sheetToRows(workbook, nomSheetName));
  const prizeQueue = parsePrixSheet(sheetToRows(workbook, prixSheetName));

  return { entries, prizeQueue };
}

function buildWheelTemplateBuffer() {
  if (fs.existsSync(TEMPLATE_NUMBERS_PATH)) {
    return fs.readFileSync(TEMPLATE_NUMBERS_PATH);
  }

  const nomRows = [
    ["Nom"],
    ["Marie"],
    ["Jean"],
    ["Sophie"],
    ["Lucas"],
    ["Alex"],
    ["Sam"]
  ];

  const prixRows = [
    ["Prix en jeu", "Quantité"],
    ["100 $", 3],
    ["Cadeau surprise", 2],
    ["JACKPOT", 1]
  ];

  const nomSheet = XLSX.utils.aoa_to_sheet(nomRows);
  nomSheet["!cols"] = [{ wch: 24 }];

  const prixSheet = XLSX.utils.aoa_to_sheet(prixRows);
  prixSheet["!cols"] = [{ wch: 24 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, nomSheet, "nom");
  XLSX.utils.book_append_sheet(workbook, prixSheet, "prix");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function getWheelTemplateFilename() {
  if (fs.existsSync(TEMPLATE_NUMBERS_PATH)) {
    return "DJ_Carl_Roue_Modele.numbers";
  }

  return "DJ_Carl_Roue_Modele.xlsx";
}

function getWheelTemplateContentType() {
  if (fs.existsSync(TEMPLATE_NUMBERS_PATH)) {
    return "application/vnd.apple.numbers";
  }

  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

module.exports = {
  parseWheelWorkbook,
  buildWheelTemplateBuffer,
  getWheelTemplateFilename,
  getWheelTemplateContentType,
  TEMPLATE_NUMBERS_PATH
};
