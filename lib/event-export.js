const PDFDocument = require("pdfkit");
const { ZipArchive } = require("archiver");
const { buildSummarySheet } = require("./summary-sheet");
const { getQuestionnaireForEvent } = require("./questionnaire");
const { getMusicDataForEvent } = require("./music");
const { getTimelineItems } = require("./timeline");
const { getDjNotes } = require("./dj-notes");
const { getEventServices } = require("./events-db");
const { clientShortName, formatTime } = require("./helpers");

const MUSIC_TITLE = "Musique — onglet Musique";
const TIMELINE_TITLE = "Plan de soirée";
const DJ_NOTES_TITLE = "Notes DJ (privées)";
const META_TITLE = "Métadonnées";
const HEADER_TITLES = new Set(["Client et événement", "Services", "Personne à contacter le jour J"]);

function sanitizeFolderName(event) {
  const name = clientShortName(event)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "evenement";
  const date = (event.event_date || "sans-date").slice(0, 10);
  return `${name}-${date}`;
}

function splitSummarySections(sections) {
  const header = [];
  const questionnaire = [];
  const music = [];
  const timeline = [];
  const notes = [];
  const meta = [];

  for (const sec of sections) {
    if (HEADER_TITLES.has(sec.title)) header.push(sec);
    else if (sec.title === MUSIC_TITLE) music.push(sec);
    else if (sec.title === TIMELINE_TITLE) timeline.push(sec);
    else if (sec.title === DJ_NOTES_TITLE) notes.push(sec);
    else if (sec.title === META_TITLE) meta.push(sec);
    else questionnaire.push(sec);
  }

  return { header, questionnaire, music, timeline, notes, meta, all: sections };
}

function buildClientPlanSection(q) {
  const steps = q?.client_plan?.steps || [];
  if (!steps.length) return null;

  return {
    title: "Plan proposé par le client",
    rows: steps.map((step, index) => ({
      label: `${index + 1}.`,
      value: [step.time ? formatTime(step.time) : null, step.title, step.description]
        .filter(Boolean)
        .join(" · "),
      link: null
    }))
  };
}

function renderPdf(title, subtitle, sections) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "LETTER" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text(title, { align: "left" });
    if (subtitle) {
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10).fillColor("#555555").text(subtitle);
      doc.fillColor("#000000");
    }
    doc.moveDown(1);

    for (const sec of sections) {
      if (!sec?.rows?.length) continue;
      doc.font("Helvetica-Bold").fontSize(12).text(sec.title);
      doc.moveDown(0.35);

      for (const rowItem of sec.rows) {
        const label = `${rowItem.label} : `;
        doc.font("Helvetica-Bold").fontSize(10).text(label, { continued: true });
        doc.font("Helvetica").text(String(rowItem.value ?? "—"), {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 120
        });
        doc.moveDown(0.15);
      }

      doc.moveDown(0.6);
    }

    doc.end();
  });
}

function zipBuffers(folderName, files) {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive();
    const chunks = [];

    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    for (const file of files) {
      archive.append(file.buffer, { name: `${folderName}/${file.name}` });
    }

    archive.finalize();
  });
}

async function buildEventDossierZip(db, event) {
  const questionnaire = getQuestionnaireForEvent(db, event.id, event.event_type);
  const services = getEventServices(db, event.id);
  const music = getMusicDataForEvent(db, event.id, event.event_type);
  const timelineItems = getTimelineItems(db, event.id);
  const djNotes = getDjNotes(db, event.id);

  const summarySheet = buildSummarySheet({
    event,
    services,
    questionnaire,
    music,
    timelineItems,
    djNotes
  });

  const split = splitSummarySections(summarySheet.sections);
  const clientPlan = buildClientPlanSection(questionnaire.data);
  const timelineSections = clientPlan ? [...split.timeline, clientPlan] : split.timeline;

  const subtitle = `${event.event_type} — ${summarySheet.generatedAt}`;
  const eventTitle = clientShortName(event);

  const files = [
    {
      name: "01-fiche-recap.pdf",
      buffer: await renderPdf(`Fiche récap — ${eventTitle}`, subtitle, split.all)
    },
    {
      name: "02-resume.pdf",
      buffer: await renderPdf(`Résumé — ${eventTitle}`, subtitle, split.header)
    },
    {
      name: "03-questionnaire.pdf",
      buffer: await renderPdf(`Questionnaire — ${eventTitle}`, subtitle, split.questionnaire)
    },
    {
      name: "04-musique.pdf",
      buffer: await renderPdf(`Musique — ${eventTitle}`, subtitle, split.music)
    },
    {
      name: "05-plan-soiree.pdf",
      buffer: await renderPdf(`Plan de soirée — ${eventTitle}`, subtitle, timelineSections)
    },
    {
      name: "06-notes-dj.pdf",
      buffer: await renderPdf(`Notes DJ — ${eventTitle}`, subtitle, split.notes)
    }
  ];

  return {
    folderName: sanitizeFolderName(event),
    zipBuffer: await zipBuffers(sanitizeFolderName(event), files)
  };
}

module.exports = { buildEventDossierZip, sanitizeFolderName };
