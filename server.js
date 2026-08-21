const express = require("express");
const fs = require("fs");
const path = require("path");
const { initDatabase, DB_PATH, DATA_DIR } = require("./database");
const {
  STATUS_LABELS,
  EVENT_TYPES,
  SERVICE_OPTIONS,
  BASE_SERVICE_OPTIONS,
  ADDON_SERVICE_OPTIONS,
  SUPPLEMENTARY_SERVICE_OPTIONS,
  CUSTOM_SERVICE_SLOT_COUNT,
  formatDateFr,
  formatTime,
  formatDateTimeFr,
  formatTimestampFr,
  formatDateRangeFr,
  endDatetimeLocalValue,
  statusLabel,
  statusBadgeClass,
  parseAllServices,
  splitServicesForForm,
  BINGO_MUSICAL_STYLE_OPTIONS,
  googleMapsUrl,
  googleMapsDirectionsUrl
} = require("./lib/helpers");
const {
  loadRouteOrigins,
  resolveRouteOrigin,
  routeOriginLabel,
  resolveDepartureAddress,
  fetchDrivingRoute,
  suggestAddresses,
  coordinatesFromParams
} = require("./lib/route-time");
const {
  getDashboardData,
  getEventById,
  getEventServices,
  getEventSummary,
  createEvent,
  saveEventServices,
  saveServiceFormData,
  updateEventDetails,
  updateEventStatus,
  deleteEvent,
  restoreEvent,
  permanentlyDeleteEvent,
  clientShortName,
  clientFullName
} = require("./lib/events-db");
const {
  bodyToQuestionnaire,
  getQuestionnaire,
  saveQuestionnaire,
  getQuestionnaireForEvent,
  bodyToQuestionnaireForEvent,
  saveQuestionnaireForEvent,
  isWeddingEvent,
  getQuestionnaireLabel,
  COCKTAIL_STYLES,
  COCKTAIL_LOCATION_OPTIONS,
  PARTY_DECADES,
  ANIMATION_LEVELS,
  ANIMATION_ACTIVITIES,
  INVITE_GUESTS_OPTIONS,
  GUEST_REQUEST_OPTIONS,
  AGE_GROUPS,
  EVENING_THEME_OPTIONS,
  PARTY_GUEST_REQUEST_OPTIONS
} = require("./lib/questionnaire");
const {
  ensurePortalToken,
  regeneratePortalToken,
  setPortalEnabled,
  getPortalLinks,
  getEventByPortalToken,
  touchPortalAccess
} = require("./lib/portal");
const {
  getTimelineItems,
  addTimelineItem,
  updateTimelineItem,
  deleteTimelineItem,
  moveTimelineItem,
  generateFromQuestionnaire,
  buildStepsFromQuestionnaire,
  buildStepsFromWeddingQuestionnaire,
  buildStepsFromPartyQuestionnaire
} = require("./lib/timeline");
const {
  getMusicDataForEvent,
  saveMusicForEvent,
  syncMusicFromQuestionnaireForEvent,
  syncQuestionnaireFromMusicForEvent
} = require("./lib/music");
const { getQuestionnaireMissing } = require("./lib/questionnaire-missing");
const { getDjNotes, saveDjNotes } = require("./lib/dj-notes");
const { buildSummarySheet } = require("./lib/summary-sheet");
const { parseMonthParam, getCalendarData } = require("./lib/calendar");
const { importDatabaseFromFile } = require("./lib/import-database");

function eventRedirect(eventId, tab, params = {}) {
  const qs = new URLSearchParams({ tab, ...params }).toString();
  return `/events/${eventId}?${qs}`;
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

if (process.env.NODE_ENV === "production" || process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

const db = initDatabase();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const IMPORT_SECRET = process.env.IMPORT_SECRET?.trim();
if (IMPORT_SECRET) {
  app.get("/admin/import-db", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "import-db.html"));
  });

  app.post(
    "/admin/import-db",
    express.raw({ type: () => true, limit: "20mb" }),
    (req, res) => {
      if (req.headers["x-import-secret"] !== IMPORT_SECRET) {
        return res.status(403).json({ error: "Mot de passe incorrect" });
      }
      if (!req.body?.length) {
        return res.status(400).json({ error: "Fichier vide — choisissez djcarl-upload.db" });
      }

      const tmpPath = path.join(DATA_DIR, `.import-tmp-${Date.now()}.db`);
      try {
        fs.writeFileSync(tmpPath, req.body);
        const events = importDatabaseFromFile(db, tmpPath);
        fs.unlinkSync(tmpPath);
        res.json({ ok: true, events, message: "Import réussi" });
      } catch (err) {
        console.error("Import DB failed:", err);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        res.status(500).json({ error: "Import échoué — vérifiez le fichier .db" });
      }
    }
  );
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/js", (req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

app.locals.formatDateFr = formatDateFr;
app.locals.formatTime = formatTime;
app.locals.formatDateTimeFr = formatDateTimeFr;
app.locals.formatTimestampFr = formatTimestampFr;
app.locals.formatDateRangeFr = formatDateRangeFr;
app.locals.endDatetimeLocalValue = endDatetimeLocalValue;
app.locals.statusLabel = statusLabel;
app.locals.statusBadgeClass = statusBadgeClass;
app.locals.clientShortName = clientShortName;
app.locals.clientFullName = clientFullName;
app.locals.googleMapsUrl = googleMapsUrl;
app.locals.googleMapsDirectionsUrl = googleMapsDirectionsUrl;
app.locals.ROUTE_ORIGIN_OPTIONS = loadRouteOrigins();
app.locals.resolveRouteOrigin = resolveRouteOrigin;
app.locals.routeOriginLabel = routeOriginLabel;
app.locals.resolveDepartureAddress = resolveDepartureAddress;
app.locals.STATUS_LABELS = STATUS_LABELS;
app.locals.EVENT_TYPES = EVENT_TYPES;
app.locals.SERVICE_OPTIONS = SERVICE_OPTIONS;
app.locals.BASE_SERVICE_OPTIONS = BASE_SERVICE_OPTIONS;
app.locals.ADDON_SERVICE_OPTIONS = ADDON_SERVICE_OPTIONS;
app.locals.SUPPLEMENTARY_SERVICE_OPTIONS = SUPPLEMENTARY_SERVICE_OPTIONS;
app.locals.CUSTOM_SERVICE_SLOT_COUNT = CUSTOM_SERVICE_SLOT_COUNT;
app.locals.COCKTAIL_STYLES = COCKTAIL_STYLES;
app.locals.COCKTAIL_LOCATION_OPTIONS = COCKTAIL_LOCATION_OPTIONS;
app.locals.PARTY_DECADES = PARTY_DECADES;
app.locals.ANIMATION_LEVELS = ANIMATION_LEVELS;
app.locals.ANIMATION_ACTIVITIES = ANIMATION_ACTIVITIES;
app.locals.INVITE_GUESTS_OPTIONS = INVITE_GUESTS_OPTIONS;
app.locals.GUEST_REQUEST_OPTIONS = GUEST_REQUEST_OPTIONS;
app.locals.AGE_GROUPS = AGE_GROUPS;
app.locals.EVENING_THEME_OPTIONS = EVENING_THEME_OPTIONS;
app.locals.PARTY_GUEST_REQUEST_OPTIONS = PARTY_GUEST_REQUEST_OPTIONS;
app.locals.BINGO_MUSICAL_STYLE_OPTIONS = BINGO_MUSICAL_STYLE_OPTIONS;
app.locals.isWeddingEvent = isWeddingEvent;
app.locals.getQuestionnaireLabel = getQuestionnaireLabel;

app.get("/api/health", (req, res) => {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => row.name);

  res.json({
    ok: true,
    database: DB_PATH,
    events: db.prepare("SELECT COUNT(*) AS n FROM events WHERE deleted_at IS NULL").get().n,
    tables
  });
});

app.get("/api/address-suggest", async (req, res) => {
  const query = req.query.q?.trim();
  if (!query || query.length < 3) {
    return res.json({ suggestions: [] });
  }

  try {
    const suggestions = await suggestAddresses(query, 6);
    res.json({ suggestions });
  } catch {
    res.status(502).json({ error: "Suggestions indisponibles.", suggestions: [] });
  }
});

app.get("/api/route-time", async (req, res) => {
  const origin = req.query.origin?.trim();
  const destination = req.query.destination?.trim();

  if (!origin || !destination) {
    return res.status(400).json({ error: "Adresse de départ et de destination requises." });
  }

  const originCoords = coordinatesFromParams(
    req.query.originLat,
    req.query.originLon,
    origin
  );
  const destinationCoords = coordinatesFromParams(
    req.query.destLat,
    req.query.destLon,
    destination
  );

  try {
    const route = await fetchDrivingRoute(
      origin,
      destination,
      originCoords,
      destinationCoords
    );
    res.json({
      ...route,
      directionsUrl: googleMapsDirectionsUrl(origin, destination, {
        fromLat: route.originLat,
        fromLon: route.originLon,
        toLat: route.destLat,
        toLon: route.destLon
      })
    });
  } catch (err) {
    const message =
      err.message === "Origin not found"
        ? "Adresse de départ introuvable."
        : err.message === "Destination not found"
          ? "Adresse de l'événement introuvable."
          : err.message === "No route found"
            ? "Aucun itinéraire trouvé."
            : err.message === "Routing failed"
              ? "Service d'itinéraire indisponible. Réessayez dans un moment."
              : "Impossible de calculer le temps de route.";
    res.status(422).json({ error: message });
  }
});

app.get("/", (req, res) => {
  const data = getDashboardData(db);
  res.render("dashboard", {
    title: "DJ CARL — Gestion des événements",
    activeNav: "dashboard",
    deleted: req.query.deleted === "1",
    restored: req.query.restored === "1",
    destroyed: req.query.destroyed === "1",
    ...data
  });
});

app.get("/calendar", (req, res) => {
  const { year, month } = parseMonthParam(req.query.year, req.query.month);
  const cal = getCalendarData(db, year, month);
  const selectedDate = req.query.date || null;
  const selectedEvents = selectedDate ? cal.byDate[selectedDate] || [] : [];

  res.render("calendar", {
    title: "Calendrier — DJ CARL",
    activeNav: "calendar",
    ...cal,
    selectedDate,
    selectedEvents
  });
});

app.get("/events/new", (req, res) => {
  res.render("event-new", {
    title: "Nouvel événement — DJ CARL",
    activeNav: "new",
    eventTypes: EVENT_TYPES,
    serviceOptions: SERVICE_OPTIONS,
    errors: [],
    values: {}
  });
});

app.post("/events/new", (req, res) => {
  const values = req.body;
  const errors = [];

  if (!values.first_name_1?.trim()) {
    errors.push(
      values.event_type === "Mariage"
        ? "Le prénom du mari est requis."
        : "La personne contact est requise."
    );
  }
  if (values.event_type !== "Mariage" && !values.last_name?.trim()) {
    errors.push("Le nom de l'entreprise est requis.");
  }
  if (!values.event_type) errors.push("Le type d'événement est requis.");
  if (!values.event_date) errors.push("La date est requise.");

  if (errors.length > 0) {
    return res.status(400).render("event-new", {
      title: "Nouvel événement — DJ CARL",
      activeNav: "new",
      eventTypes: EVENT_TYPES,
      serviceOptions: SERVICE_OPTIONS,
      errors,
      values
    });
  }

  try {
    const eventId = createEvent(db, values);
    res.redirect(`/events/${eventId}?created=1`);
  } catch (err) {
    console.error(err);
    res.status(500).render("event-new", {
      title: "Nouvel événement — DJ CARL",
      activeNav: "new",
      eventTypes: EVENT_TYPES,
      serviceOptions: SERVICE_OPTIONS,
      errors: ["Erreur lors de la création. Veuillez réessayer."],
      values
    });
  }
});

app.post("/events/:id/delete", (req, res) => {
  const eventId = Number(req.params.id);
  const deleted = deleteEvent(db, eventId);
  if (!deleted) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas ou a déjà été supprimé."
    });
  }
  res.redirect("/?deleted=1#corbeille");
});

app.post("/events/:id/restore", (req, res) => {
  const eventId = Number(req.params.id);
  const restored = restoreEvent(db, eventId);
  if (!restored) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas ou n'est pas dans la corbeille."
    });
  }
  res.redirect("/?restored=1");
});

app.post("/events/:id/destroy", (req, res) => {
  const eventId = Number(req.params.id);
  const event = getEventById(db, eventId);
  if (!event || !event.deleted_at) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas ou n'est pas dans la corbeille."
    });
  }

  permanentlyDeleteEvent(db, eventId);
  res.redirect("/?destroyed=1#corbeille");
});

app.get("/events/:id", (req, res) => {
  const event = getEventById(db, Number(req.params.id));
  if (!event) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas ou a été supprimé."
    });
  }

  const services = getEventServices(db, event.id);
  const { selectedServices, customServiceSlots } = splitServicesForForm(services);
  const summary = getEventSummary(db, event.id, event.event_type);
  const tab = req.query.tab || "resume";
  const questionnaire = getQuestionnaireForEvent(db, event.id, event.event_type);
  const portalToken = ensurePortalToken(db, event.id);
  const portalLinks = getPortalLinks(req, portalToken);
  const timelineItems = getTimelineItems(db, event.id);
  const proposedTimelineSteps = buildStepsFromQuestionnaire(
    questionnaire.data,
    event.event_type
  );
  const music = getMusicDataForEvent(db, event.id, event.event_type);
  const djNotes = getDjNotes(db, event.id);
  const summarySheet = buildSummarySheet({
    event,
    services,
    questionnaire,
    music,
    timelineItems,
    djNotes
  });
  const missingQuestions = getQuestionnaireMissing(event.event_type, questionnaire.data);

  let timelineNeedsConfirm = false;
  let timelineExistingCount = 0;
  if (req.query.timelineConfirm === "1" && questionnaire) {
    timelineNeedsConfirm = true;
    timelineExistingCount = timelineItems.length;
  }

  res.render("event", {
    title: `${clientShortName(event)} — DJ CARL`,
    activeNav: "dashboard",
    event,
    services,
    selectedServices,
    customServiceSlots,
    summary,
    questionnaire,
    portalLinks,
    portalToken,
    timelineItems,
    proposedTimelineSteps,
    music,
    djNotes,
    summarySheet,
    missingQuestions,
    tab,
    created: req.query.created === "1",
    statusUpdated: req.query.statusUpdated === "1",
    questionnaireSaved: req.query.questionnaireSaved === "1",
    portalRegenerated: req.query.portalRegenerated === "1",
    portalToggled: req.query.portalToggled === "1",
    timelineSaved: req.query.timelineSaved === "1",
    timelineGenerated: req.query.timelineGenerated === "1",
    timelineGeneratedMessage: req.query.timelineMsg || "",
    timelineNeedsConfirm,
    timelineExistingCount,
    musicSaved: req.query.musicSaved === "1",
    notesSaved: req.query.notesSaved === "1",
    servicesSaved: req.query.servicesSaved === "1",
    resumeSaved: req.query.resumeSaved === "1"
  });
});

app.post("/events/:id/resume/save", (req, res) => {
  const eventId = Number(req.params.id);
  const event = getEventById(db, eventId);
  if (!event) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas."
    });
  }

  const body = req.body;
  const needsLastName = body.event_type !== "Mariage";
  if (!body.first_name_1?.trim() || (needsLastName && !body.last_name?.trim()) || !body.event_type || !body.event_date) {
    return res.redirect(`/events/${eventId}?tab=resume&resumeError=1`);
  }

  try {
    updateEventDetails(db, eventId, body);
    res.redirect(`/events/${eventId}?tab=resume&resumeSaved=1`);
  } catch (err) {
    console.error(err);
    res.redirect(`/events/${eventId}?tab=resume`);
  }
});

app.post("/events/:id/questionnaire", (req, res) => {
  const eventId = Number(req.params.id);
  const event = getEventById(db, eventId);

  if (!event) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas."
    });
  }

  try {
    const data = bodyToQuestionnaireForEvent(req.body, event.event_type);
    saveQuestionnaireForEvent(db, eventId, event.event_type, data);
    syncMusicFromQuestionnaireForEvent(db, eventId, event.event_type, data);
    res.redirect(`/events/${eventId}?tab=questionnaire&questionnaireSaved=1`);
  } catch (err) {
    console.error(err);
    res.redirect(`/events/${eventId}?tab=questionnaire`);
  }
});

app.post("/events/:id/portal/regenerate", (req, res) => {
  const eventId = Number(req.params.id);
  if (!getEventById(db, eventId)) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas."
    });
  }

  regeneratePortalToken(db, eventId);
  res.redirect(`/events/${eventId}?tab=resume&portalRegenerated=1`);
});

app.post("/events/:id/portal/toggle", (req, res) => {
  const eventId = Number(req.params.id);
  const event = getEventById(db, eventId);
  if (!event) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas."
    });
  }

  setPortalEnabled(db, eventId, req.body.enabled === "1");
  res.redirect(`/events/${eventId}?tab=resume&portalToggled=1`);
});

app.get("/portal/:token", (req, res) => {
  const event = getEventByPortalToken(db, req.params.token);
  if (!event) {
    return res.status(404).render("portal/error", {
      title: "Lien invalide",
      message: "Ce lien n'est plus valide ou a été désactivé."
    });
  }

  touchPortalAccess(db, event.id);
  const summary = getEventSummary(db, event.id, event.event_type);

  res.render("portal/home", {
    title: `${clientShortName(event)} — DJ Carl`,
    event,
    summary
  });
});

app.get("/portal/:token/questionnaire", (req, res) => {
  const event = getEventByPortalToken(db, req.params.token);
  if (!event) {
    return res.status(404).render("portal/error", {
      title: "Lien invalide",
      message: "Ce lien n'est plus valide ou a été désactivé."
    });
  }

  touchPortalAccess(db, event.id);
  const questionnaire = getQuestionnaireForEvent(db, event.id, event.event_type);

  res.render("portal/questionnaire", {
    title: `${getQuestionnaireLabel(event.event_type)} — ${clientShortName(event)}`,
    event,
    questionnaire,
    saved: req.query.saved === "1"
  });
});

app.post("/portal/:token/questionnaire", (req, res) => {
  const event = getEventByPortalToken(db, req.params.token);
  if (!event) {
    return res.status(404).render("portal/error", {
      title: "Lien invalide",
      message: "Ce lien n'est plus valide ou a été désactivé."
    });
  }

  try {
    const data = bodyToQuestionnaireForEvent(req.body, event.event_type);
    saveQuestionnaireForEvent(db, event.id, event.event_type, data);
    syncMusicFromQuestionnaireForEvent(db, event.id, event.event_type, data);
    res.redirect(`/portal/${req.params.token}/questionnaire?saved=1`);
  } catch (err) {
    console.error(err);
    res.redirect(`/portal/${req.params.token}/questionnaire`);
  }
});

app.post("/events/:id/timeline/add", (req, res) => {
  const eventId = Number(req.params.id);
  if (!getEventById(db, eventId)) return res.status(404).send("Not found");
  if (!req.body.title?.trim()) return res.redirect(eventRedirect(eventId, "timeline"));
  addTimelineItem(db, eventId, req.body);
  res.redirect(eventRedirect(eventId, "timeline", { timelineSaved: "1" }));
});

app.post("/events/:id/timeline/:itemId/update", (req, res) => {
  const eventId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!getEventById(db, eventId)) return res.status(404).send("Not found");
  updateTimelineItem(db, itemId, eventId, req.body);
  res.redirect(eventRedirect(eventId, "timeline", { timelineSaved: "1" }));
});

app.post("/events/:id/timeline/:itemId/delete", (req, res) => {
  const eventId = Number(req.params.id);
  deleteTimelineItem(db, Number(req.params.itemId), eventId);
  res.redirect(eventRedirect(eventId, "timeline", { timelineSaved: "1" }));
});

app.post("/events/:id/timeline/:itemId/move-up", (req, res) => {
  const eventId = Number(req.params.id);
  moveTimelineItem(db, Number(req.params.itemId), eventId, "up");
  res.redirect(eventRedirect(eventId, "timeline"));
});

app.post("/events/:id/timeline/:itemId/move-down", (req, res) => {
  const eventId = Number(req.params.id);
  moveTimelineItem(db, Number(req.params.itemId), eventId, "down");
  res.redirect(eventRedirect(eventId, "timeline"));
});

app.post("/events/:id/timeline/generate", (req, res) => {
  const eventId = Number(req.params.id);
  const event = getEventById(db, eventId);
  if (!event) {
    return res.redirect(eventRedirect(eventId, "timeline"));
  }

  const questionnaire = getQuestionnaireForEvent(db, eventId, event.event_type);
  const result = generateFromQuestionnaire(db, eventId, questionnaire.data, {
    confirm: req.body.confirm === "1",
    eventType: event.event_type
  });

  if (result.needsConfirm) {
    return res.redirect(
      eventRedirect(eventId, "timeline", { timelineConfirm: "1" })
    );
  }

  let msg;
  if (!result.proposedCount) {
    msg =
      "Aucune étape trouvée dans le questionnaire. Remplissez les heures (entrée, souper, party…) puis enregistrez le questionnaire avant de générer.";
  } else if (!result.added) {
    msg = `Toutes les étapes (${result.skipped}) existent déjà dans le plan de soirée.`;
  } else {
    msg = `${result.added} étape(s) ajoutée(s)${result.skipped ? `, ${result.skipped} ignorée(s) (déjà existantes)` : ""}.`;
  }

  res.redirect(
    eventRedirect(eventId, "timeline", { timelineGenerated: "1", timelineMsg: msg })
  );
});

app.post("/events/:id/services/save", (req, res) => {
  const eventId = Number(req.params.id);
  if (!getEventById(db, eventId)) return res.status(404).send("Not found");
  saveServiceFormData(db, eventId, req.body);
  res.redirect(eventRedirect(eventId, "services", { servicesSaved: "1" }));
});

app.post("/events/:id/music/save", (req, res) => {
  const eventId = Number(req.params.id);
  const event = getEventById(db, eventId);
  if (!event) return res.status(404).send("Not found");
  saveMusicForEvent(db, eventId, event.event_type, req.body);
  syncQuestionnaireFromMusicForEvent(db, eventId, event.event_type);
  res.redirect(eventRedirect(eventId, "musique", { musicSaved: "1" }));
});

app.post("/events/:id/notes/save", (req, res) => {
  const eventId = Number(req.params.id);
  if (!getEventById(db, eventId)) return res.status(404).send("Not found");
  saveDjNotes(db, eventId, req.body);
  res.redirect(eventRedirect(eventId, "notes", { notesSaved: "1" }));
});

app.post("/events/:id/status", (req, res) => {
  const eventId = Number(req.params.id);
  const event = getEventById(db, eventId);
  if (!event) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas."
    });
  }

  try {
    updateEventStatus(db, eventId, req.body.status);
    res.redirect(`/events/${eventId}?tab=resume&statusUpdated=1`);
  } catch {
    res.redirect(`/events/${eventId}?tab=resume`);
  }
});

app.use((req, res) => {
  res.status(404).render("error", {
    title: "Page introuvable",
    activeNav: "",
    message: "La page demandée n'existe pas."
  });
});

app.listen(PORT, HOST, () => {
  const base = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  console.log(`DJ Carl Events — ${base}`);
  console.log(`Base SQLite : ${DB_PATH}`);
});
