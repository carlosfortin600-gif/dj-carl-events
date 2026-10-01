const DEFAULT_SERVICE_DESCRIPTION =
  "Prestation de services techniques pour l'événement (montage, opération et démontage selon les besoins convenus).";
const DEFAULT_PAYMENT_TERMS = "Paiement à la fin de la prestation, sauf entente contraire.";

const DEFAULT_SUBCONTRACTOR_ID = "eric";

const SEED_SUBCONTRACTORS = [
  {
    id: "eric",
    label: "Éric Moreault",
    service_description: DEFAULT_SERVICE_DESCRIPTION,
    payment_terms: DEFAULT_PAYMENT_TERMS,
    sort_order: 1
  },
  {
    id: "mario",
    label: "Mario",
    service_description: DEFAULT_SERVICE_DESCRIPTION,
    payment_terms: DEFAULT_PAYMENT_TERMS,
    sort_order: 2
  },
  {
    id: "francis",
    label: "Francis Martel",
    service_description: DEFAULT_SERVICE_DESCRIPTION,
    payment_terms: DEFAULT_PAYMENT_TERMS,
    sort_order: 3
  }
];

function slugifySubcontractorId(label) {
  const base = String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "sous-traitant";
}

function seedSubcontractorsIfEmpty(db) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM subcontractors").get().n;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO subcontractors (id, label, service_description, payment_terms, sort_order)
    VALUES (@id, @label, @service_description, @payment_terms, @sort_order)
  `);
  for (const row of SEED_SUBCONTRACTORS) {
    insert.run(row);
  }
}

function getSubcontractors(db) {
  return db
    .prepare(
      `SELECT id, label FROM subcontractors ORDER BY sort_order ASC, label COLLATE NOCASE ASC`
    )
    .all();
}

function getSubcontractorRow(db, id) {
  return db
    .prepare(
      `SELECT id, label, service_description, payment_terms
       FROM subcontractors WHERE id = ?`
    )
    .get(id);
}

function isValidSubcontractor(db, id) {
  if (!id) return false;
  return Boolean(getSubcontractorRow(db, id));
}

function getSubcontractorLabel(db, id) {
  return getSubcontractorRow(db, id)?.label || id;
}

function getContractDefaults(db, subcontractorId) {
  const row = getSubcontractorRow(db, subcontractorId);
  if (!row) {
    return {
      full_name: subcontractorId,
      service_description: DEFAULT_SERVICE_DESCRIPTION,
      payment_terms: DEFAULT_PAYMENT_TERMS
    };
  }
  return {
    full_name: row.label,
    service_description: row.service_description || DEFAULT_SERVICE_DESCRIPTION,
    payment_terms: row.payment_terms || DEFAULT_PAYMENT_TERMS
  };
}

function addSubcontractor(db, label) {
  const trimmed = String(label || "").trim();
  if (!trimmed) {
    return { ok: false, error: "Le nom du sous-traitant est requis." };
  }

  const duplicate = db
    .prepare("SELECT id FROM subcontractors WHERE lower(label) = lower(?)")
    .get(trimmed);
  if (duplicate) {
    return { ok: false, error: "Un sous-traitant avec ce nom existe déjà." };
  }

  let id = slugifySubcontractorId(trimmed);
  let suffix = 2;
  while (getSubcontractorRow(db, id)) {
    id = `${slugifySubcontractorId(trimmed)}-${suffix}`;
    suffix += 1;
  }

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM subcontractors").get().n;

  db.prepare(
    `INSERT INTO subcontractors (id, label, service_description, payment_terms, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, trimmed, DEFAULT_SERVICE_DESCRIPTION, DEFAULT_PAYMENT_TERMS, maxOrder + 1);

  return { ok: true, id, label: trimmed };
}

module.exports = {
  DEFAULT_SUBCONTRACTOR_ID,
  SEED_SUBCONTRACTORS,
  seedSubcontractorsIfEmpty,
  getSubcontractors,
  getSubcontractorRow,
  isValidSubcontractor,
  getSubcontractorLabel,
  getContractDefaults,
  addSubcontractor,
  DEFAULT_SERVICE_DESCRIPTION,
  DEFAULT_PAYMENT_TERMS
};
