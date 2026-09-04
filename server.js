const express = require("express");
const fs = require("fs");
const path = require("path");
const { initDatabase, DB_PATH, DATA_DIR, isPersistentStorage } = require("./database");
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
  formatDateTimeRangeFr,
  endDatetimeLocalValue,
  statusLabel,
  statusBadgeClass,
  parseAllServices,
  splitServicesForForm,
  BINGO_MUSICAL_STYLE_OPTIONS,
  googleMapsUrl,
  googleMapsDirectionsUrl,
  sortByTime
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
  getPortalBaseUrls,
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
const {
  SUBCONTRACTORS,
  getSubcontractorContract,
  saveSubcontractorContract,
  saveSubcontractorSignatureOnly,
  ensureContractSignToken,
  getContractBySignToken,
  getContractSignLinks,
  hasSubcontractorContract,
  deleteSubcontractorContract,
  datetimeLocalValue,
  isValidSubcontractor,
  getSubcontractorLabel
} = require("./lib/subcontractor-contracts");
const {
  ensureSubcontractorCalendarToken,
  getSubcontractorByCalendarToken,
  getSubcontractorCalendarLinks,
  getAllSubcontractorCalendarLinks
} = require("./lib/subcontractor-calendar-access");
const { buildSummarySheet } = require("./lib/summary-sheet");
const { buildEventDossierZip, buildAllEventsDossierZip } = require("./lib/event-export");
const { buildEventIcs, buildEventIcsFilename } = require("./lib/event-ics");
const { applyPlanSoireeFromBody } = require("./lib/plan-soiree");
const {
  notifyDjCarlClientUpdate,
  getUnreadPortalNotifications,
  getUnreadPortalNotificationCount,
  getLastPortalClientUpdate,
  hasUnreadPortalNotificationForEvent,
  markPortalNotificationsReadForEvent,
  markPortalNotificationRead,
  sendTestNotificationEmail,
  describeMailError
} = require("./lib/portal-notifications");
const { summarizePortalChanges } = require("./lib/portal-change-summary");
const { RESEND_TEST_FROM } = require("./lib/email-send");
const { startConfirmationEmailScheduler, sendConfirmationEmailToClient, confirmationEmailErrorMessage, getConfirmationEmailCopyTo } = require("./lib/confirmation-email");
const {
  getEventForPortalConfirm,
  getPortalAccessDeniedReason,
  portalAccessDeniedMessage,
  normalizeConfirmedByName,
  recordClientConfirmation
} = require("./lib/client-confirmation");
const {
  getNotificationSettings,
  saveNotificationSettings,
  isEmailNotificationConfigured,
  getEffectiveNotificationConfig
} = require("./lib/app-settings");
const { parseMonthParam, parseViewParam, getCalendarViewData, getSubcontractorCalendarData, getSubcontractorAgreementsList, queryString } = require("./lib/calendar");
const { getResumeEventsList, getEventAgreementStatuses } = require("./lib/resume");
const { importDatabaseFromFile } = require("./lib/import-database");
const {
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
} = require("./lib/event-files");

function eventRedirect(eventId, tab, params = {}) {
  const qs = new URLSearchParams({ tab, ...params }).toString();
  return `/events/${eventId}?${qs}`;
}

function gestionRedirect(eventId, params = {}) {
  const gestion = params.gestion || "location";
  const { sousTraitant, ...rest } = params;
  const query = { tab: "gestion", gestion, ...rest };
  if (sousTraitant) query.sousTraitant = sousTraitant;
  const qs = new URLSearchParams(query).toString();
  return `/events/${eventId}?${qs}`;
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

if (process.env.NODE_ENV === "production" || process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

const db = initDatabase();
startConfirmationEmailScheduler(db);

function requirePortalEvent(req, res) {
  const event = getEventByPortalToken(db, req.params.token);
  if (event) return event;
  const reason = getPortalAccessDeniedReason(db, req.params.token);
  res.status(404).render("portal/error", {
    title: reason === "confirmed" ? "Dossier confirmé" : "Lien invalide",
    message: portalAccessDeniedMessage(reason)
  });
  return null;
}

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
app.locals.formatDateTimeRangeFr = formatDateTimeRangeFr;
app.locals.endDatetimeLocalValue = endDatetimeLocalValue;
app.locals.datetimeLocalValue = datetimeLocalValue;
app.locals.statusLabel = statusLabel;
app.locals.statusBadgeClass = statusBadgeClass;
app.locals.clientShortName = clientShortName;
app.locals.clientFullName = clientFullName;
app.locals.googleMapsUrl = googleMapsUrl;
app.locals.googleMapsDirectionsUrl = googleMapsDirectionsUrl;
app.locals.sortByTime = sortByTime;
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
app.locals.formatFileSize = formatFileSize;
app.locals.queryString = queryString;

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
    persistent: isPersistentStorage(),
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
    exportEmpty: req.query.exportEmpty === "1",
    portalNotifications: getUnreadPortalNotifications(db),
    portalNotificationCount: getUnreadPortalNotificationCount(db),
    emailNotificationConfigured: isEmailNotificationConfigured(db),
    ...data
  });
});

app.get("/resume", (req, res) => {
  res.render("resume", {
    title: "Résumé — DJ CARL",
    activeNav: "resume",
    eventsList: getResumeEventsList(db)
  });
});

app.get("/ententes", (req, res) => {
  res.redirect(301, "/resume");
});

app.get("/settings/notifications", (req, res) => {
  const raw = getNotificationSettings(db);
  const settings = { ...raw, smtpPass: "", resendApiKey: "" };
  const testErrorMessages = {
    not_configured: "Renseignez votre courriel et la configuration d'envoi avant de tester.",
    missing_module: "Le module d'envoi SMTP n'est pas disponible sur le serveur."
  };
  const testError = req.query.testError;
  const testDetail = req.query.testDetail
    ? decodeURIComponent(String(req.query.testDetail))
    : "";
  res.render("settings-notifications", {
    title: "Notifications — DJ CARL",
    activeNav: "notifications",
    settings,
    smtpPassSet: Boolean(raw.smtpPass),
    resendApiKeySet: Boolean(raw.resendApiKey),
    emailConfigured: isEmailNotificationConfigured(db),
    usesResend: Boolean(getEffectiveNotificationConfig(db).resendApiKey),
    resendTestFrom: RESEND_TEST_FROM,
    saved: req.query.saved === "1",
    testSent: req.query.testSent === "1",
    testProvider: req.query.testProvider || "",
    testFrom: req.query.testFrom ? decodeURIComponent(String(req.query.testFrom)) : "",
    testError: testErrorMessages[testError] || testDetail || (testError ? "L'envoi a échoué." : "")
  });
});

app.post("/settings/notifications", (req, res) => {
  saveNotificationSettings(db, req.body);
  res.redirect("/settings/notifications?saved=1");
});

app.post("/settings/notifications/test", async (req, res) => {
  try {
    saveNotificationSettings(db, req.body);
    const result = await sendTestNotificationEmail({ db, body: req.body });
    const provider = result.provider ? `&testProvider=${encodeURIComponent(result.provider)}` : "";
    const from = result.from ? `&testFrom=${encodeURIComponent(result.from)}` : "";
    return res.redirect(`/settings/notifications?testSent=1${provider}${from}`);
  } catch (err) {
    console.error("Test notification email:", err.message);
    const detail = encodeURIComponent(describeMailError(err).slice(0, 500));
    const reason = err.code === "not_configured" ? "not_configured" : "send_failed";
    res.redirect(`/settings/notifications?testError=${reason}&testDetail=${detail}`);
  }
});

app.get("/export/dossiers.zip", async (req, res) => {
  try {
    const result = await buildAllEventsDossierZip(db);
    if (!result) {
      return res.redirect("/?exportEmpty=1");
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${result.archiveName}"`);
    res.send(result.zipBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de l'export de tous les dossiers.");
  }
});

app.get("/calendar", (req, res) => {
  const { year, month } = parseMonthParam(req.query.year, req.query.month);
  const cal = getCalendarViewData(db, {
    view: req.query.view,
    date: req.query.date,
    year,
    month,
    includeDayGestion: true
  });

  res.render("calendar", {
    title: "Calendrier — DJ CARL",
    activeNav: "calendar",
    cal,
    subcontractorCalendarLinks: getAllSubcontractorCalendarLinks(db, req)
  });
});

app.get("/gestion/calendrier/:subcontractor", (req, res) => {
  const subcontractorId = req.params.subcontractor;
  if (!isValidSubcontractor(subcontractorId)) {
    return res.status(404).render("error", {
      title: "Page introuvable",
      activeNav: "dashboard",
      message: "Sous-traitant introuvable."
    });
  }

  const { year, month } = parseMonthParam(req.query.year, req.query.month);
  const cal = getSubcontractorCalendarData(db, subcontractorId, {
    view: req.query.view,
    date: req.query.date,
    year,
    month
  });
  const calendarToken = ensureSubcontractorCalendarToken(db, subcontractorId);
  const calendarShareLinks = getSubcontractorCalendarLinks(req, calendarToken);

  res.render("subcontractor-calendar", {
    title: `Calendrier ${getSubcontractorLabel(subcontractorId)} — DJ CARL`,
    activeNav: "calendar",
    subcontractorId,
    subcontractorLabel: getSubcontractorLabel(subcontractorId),
    subcontractors: SUBCONTRACTORS,
    calendarShareLinks,
    cal
  });
});

app.get("/calendrier/:token", (req, res) => {
  const match = getSubcontractorByCalendarToken(db, req.params.token);
  if (!match) {
    return res.status(404).render("error", {
      title: "Lien invalide",
      activeNav: "dashboard",
      message: "Ce lien de calendrier est invalide."
    });
  }

  const { year, month } = parseMonthParam(req.query.year, req.query.month);
  const cal = getSubcontractorCalendarData(db, match.subcontractorId, {
    view: req.query.view,
    date: req.query.date,
    year,
    month
  });

  res.render("subcontractor-calendar-public", {
    title: `Calendrier ${match.subcontractorLabel} — DJ Carl`,
    subcontractorLabel: match.subcontractorLabel,
    calendarToken: req.params.token,
    cal
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
    res.redirect(`/events/${eventId}?created=1&addCalendar=1`);
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
  deleteAllEventFiles(db, eventId);
  res.redirect("/?destroyed=1#corbeille");
});

app.get("/events/:id/calendar.ics", (req, res) => {
  const event = getEventById(db, Number(req.params.id));
  if (!event) {
    return res.status(404).send("Événement introuvable.");
  }

  try {
    const services = getEventServices(db, event.id);
    const { currentBase } = getPortalBaseUrls(req);
    const ics = buildEventIcs({
      event,
      services,
      appUrl: currentBase
    });
    const filename = buildEventIcsFilename(event);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(ics);
  } catch (err) {
    console.error("Calendar ICS:", err.message);
    res.status(500).send("Impossible de générer le fichier calendrier.");
  }
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
  const gestionSection =
    tab === "gestion"
      ? ["location", "contrat", "depart", "fichiers"].includes(req.query.gestion)
        ? req.query.gestion
        : "location"
      : null;
  const sousTraitant =
    gestionSection === "contrat" && isValidSubcontractor(req.query.sousTraitant)
      ? req.query.sousTraitant
      : "mario";
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
  const eventAgreementStatuses = getEventAgreementStatuses(db, event.id);
  const summarySheet = buildSummarySheet({
    event,
    services,
    questionnaire,
    music,
    timelineItems,
    djNotes
  });
  const missingQuestions = getQuestionnaireMissing(event.event_type, questionnaire.data);
  const eventFiles = getEventFiles(db, event.id);
  let subcontractorContract =
    gestionSection === "contrat"
      ? getSubcontractorContract(db, event.id, sousTraitant)
      : null;
  let contractSignLinks = null;
  let contractSavedInDb = false;
  let calendarShareLinks = null;
  if (gestionSection === "contrat") {
    contractSavedInDb = hasSubcontractorContract(db, event.id, sousTraitant);
    if (contractSavedInDb) {
      const signToken = ensureContractSignToken(db, event.id, sousTraitant);
      if (signToken) contractSignLinks = getContractSignLinks(req, signToken);
    }
    const calendarToken = ensureSubcontractorCalendarToken(db, sousTraitant);
    calendarShareLinks = getSubcontractorCalendarLinks(req, calendarToken);
    subcontractorContract = getSubcontractorContract(db, event.id, sousTraitant);
  }

  let timelineNeedsConfirm = false;
  let timelineExistingCount = 0;
  if (req.query.timelineConfirm === "1" && questionnaire) {
    timelineNeedsConfirm = true;
    timelineExistingCount = timelineItems.length;
  }

  const lastPortalClientUpdate = getLastPortalClientUpdate(db, event.id);
  const portalClientUpdateUnread = hasUnreadPortalNotificationForEvent(db, event.id);
  if (tab === "client" || tab === "questionnaire") {
    markPortalNotificationsReadForEvent(db, event.id);
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
    eventAgreementStatuses,
    summarySheet,
    missingQuestions,
    eventFiles,
    maxFileSize: MAX_FILE_SIZE,
    maxFilesPerUpload: MAX_FILES_PER_UPLOAD,
    tab,
    created: req.query.created === "1",
    addCalendar: req.query.addCalendar === "1",
    calendarIcsUrl: `/events/${event.id}/calendar.ics`,
    calendarIcsFilename: buildEventIcsFilename(event),
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
    resumeSaved: req.query.resumeSaved === "1",
    filesUploaded: req.query.filesUploaded === "1",
    fileDeleted: req.query.fileDeleted === "1",
    filesError: req.query.filesError || "",
    gestionSection,
    sousTraitant,
    subcontractors: SUBCONTRACTORS,
    subcontractorContract,
    contractSignLinks,
    contractSavedInDb,
    calendarShareLinks,
    contractSaved: req.query.contractSaved === "1",
    contractCleared: req.query.contractCleared === "1",
    contractError: req.query.contractError || "",
    lastPortalClientUpdate,
    portalClientUpdateUnread: tab === "client" || tab === "questionnaire" ? false : portalClientUpdateUnread,
    emailNotificationConfigured: isEmailNotificationConfigured(db),
    confirmationEmailCopyTo: getConfirmationEmailCopyTo(),
    confirmationEmailSent: req.query.confirmationEmailSent === "1",
    confirmationEmailForwarded: req.query.confirmationEmailForwarded === "1",
    confirmationEmailError: req.query.confirmationEmailError || ""
  });
});

app.post("/events/:id/files/upload", (req, res) => {
  const eventId = Number(req.params.id);
  const event = getEventById(db, eventId);
  if (!event || event.deleted_at) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas ou a été supprimé."
    });
  }

  const upload = createUploadMiddleware(eventId);
  upload.array("files", MAX_FILES_PER_UPLOAD)(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `Fichier trop volumineux (max ${formatFileSize(MAX_FILE_SIZE)}).`
          : "Téléversement impossible.";
      return res.redirect(gestionRedirect(eventId, { gestion: "fichiers", filesError: message }));
    }

    const files = req.files || [];
    if (!files.length) {
      return res.redirect(gestionRedirect(eventId, { gestion: "fichiers", filesError: "Choisissez au moins un fichier." }));
    }

    try {
      saveUploadedFiles(db, eventId, files);
      res.redirect(gestionRedirect(eventId, { gestion: "fichiers", filesUploaded: "1" }));
    } catch (uploadErr) {
      console.error(uploadErr);
      res.redirect(gestionRedirect(eventId, { gestion: "fichiers", filesError: "Erreur lors de l'enregistrement." }));
    }
  });
});

app.get("/events/:id/files/:fileId/download", (req, res) => {
  const eventId = Number(req.params.id);
  const fileId = Number(req.params.fileId);
  const event = getEventById(db, eventId);
  if (!event) {
    return res.status(404).send("Not found");
  }

  const file = getEventFileById(db, fileId, eventId);
  if (!file) {
    return res.status(404).send("Not found");
  }

  const filePath = getStoredFilePath(eventId, file.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Fichier introuvable");
  }

  res.download(filePath, file.original_name);
});

app.post("/events/:id/files/:fileId/delete", (req, res) => {
  const eventId = Number(req.params.id);
  if (!getEventById(db, eventId)) {
    return res.status(404).send("Not found");
  }

  deleteEventFile(db, Number(req.params.fileId), eventId);
  res.redirect(gestionRedirect(eventId, { gestion: "fichiers", fileDeleted: "1" }));
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

app.get("/events/:id/export/dossier.zip", async (req, res) => {
  const event = getEventById(db, Number(req.params.id));
  if (!event) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas."
    });
  }

  try {
    const { folderName, zipBuffer } = await buildEventDossierZip(db, event);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${folderName}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de l'export PDF.");
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
  res.redirect(`/events/${eventId}?tab=client&portalRegenerated=1`);
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
  res.redirect(`/events/${eventId}?tab=client&portalToggled=1`);
});

app.post("/events/:id/confirmation-email/send", async (req, res) => {
  const eventId = Number(req.params.id);
  const event = getEventById(db, eventId);
  if (!event) {
    return res.status(404).render("error", {
      title: "Événement introuvable",
      activeNav: "dashboard",
      message: "Cet événement n'existe pas."
    });
  }

  if (!isEmailNotificationConfigured(db)) {
    return res.redirect(
      `/events/${eventId}?tab=client&confirmationEmailError=${encodeURIComponent("Courriel non configuré — allez dans Paramètres → Notifications.")}`
    );
  }

  const result = await sendConfirmationEmailToClient(db, event, { manual: true });
  if (!result.ok) {
    return res.redirect(
      `/events/${eventId}?tab=client&confirmationEmailError=${encodeURIComponent(confirmationEmailErrorMessage(result))}`
    );
  }

  res.redirect(
    `/events/${eventId}?tab=client&confirmationEmailSent=1${
      result.forwardedViaDj ? "&confirmationEmailForwarded=1" : ""
    }`
  );
});

app.get("/portal/:token/confirmer", (req, res) => {
  const event = getEventForPortalConfirm(db, req.params.token);
  if (!event) {
    const reason = getPortalAccessDeniedReason(db, req.params.token);
    return res.status(404).render("portal/error", {
      title: reason === "confirmed" ? "Dossier confirmé" : "Lien invalide",
      message: portalAccessDeniedMessage(reason)
    });
  }

  res.render("portal/confirmer", {
    title: `Confirmer — ${clientShortName(event)}`,
    event
  });
});

app.post("/portal/:token/confirmer", (req, res) => {
  const event = getEventForPortalConfirm(db, req.params.token);
  if (!event) {
    const reason = getPortalAccessDeniedReason(db, req.params.token);
    return res.status(404).render("portal/error", {
      title: reason === "confirmed" ? "Dossier confirmé" : "Lien invalide",
      message: portalAccessDeniedMessage(reason)
    });
  }

  const confirmedByName = normalizeConfirmedByName(req.body?.confirmed_by_name);
  if (!confirmedByName) {
    return res.status(400).render("portal/confirmer", {
      title: `Confirmer — ${clientShortName(event)}`,
      event,
      error: "Indiquez le nom de la personne qui confirme.",
      confirmedByName: String(req.body?.confirmed_by_name || "")
    });
  }

  recordClientConfirmation(db, event.id, confirmedByName);
  res.render("portal/confirmed", {
    title: "Dossier confirmé — DJ Carl",
    event: { ...event, client_confirmed_by_name: confirmedByName }
  });
});

app.get("/portal/:token", (req, res) => {
  const event = requirePortalEvent(req, res);
  if (!event) return;

  touchPortalAccess(db, event.id);
  const summary = getEventSummary(db, event.id, event.event_type);

  res.render("portal/home", {
    title: `${clientShortName(event)} — DJ Carl`,
    event,
    summary
  });
});

app.get("/portal/:token/questionnaire", (req, res) => {
  const event = requirePortalEvent(req, res);
  if (!event) return;

  touchPortalAccess(db, event.id);
  const questionnaire = getQuestionnaireForEvent(db, event.id, event.event_type);
  const proposedTimelineSteps = buildStepsFromQuestionnaire(
    questionnaire.data,
    event.event_type
  );
  const timelineItems = getTimelineItems(db, event.id);

  res.render("portal/questionnaire", {
    title: `${getQuestionnaireLabel(event.event_type)} — ${clientShortName(event)}`,
    event,
    questionnaire,
    proposedTimelineSteps,
    timelineItems,
    saved: req.query.saved === "1"
  });
});

app.post("/portal/:token/questionnaire", async (req, res) => {
  const event = requirePortalEvent(req, res);
  if (!event) return;

  try {
    const existing = getQuestionnaireForEvent(db, event.id, event.event_type);
    const before = existing.data;
    const data = bodyToQuestionnaireForEvent(req.body, event.event_type);
    const changes = summarizePortalChanges({
      before,
      after: data,
      eventType: event.event_type,
      kind: "questionnaire"
    });
    saveQuestionnaireForEvent(db, event.id, event.event_type, data);
    syncMusicFromQuestionnaireForEvent(db, event.id, event.event_type, data);
    await notifyDjCarlClientUpdate({ db, event, kind: "questionnaire", req, changes });
    res.redirect(`/portal/${req.params.token}/questionnaire?saved=1`);
  } catch (err) {
    console.error(err);
    res.redirect(`/portal/${req.params.token}/questionnaire`);
  }
});

app.get("/portal/:token/plan-soiree", (req, res) => {
  const event = requirePortalEvent(req, res);
  if (!event) return;

  touchPortalAccess(db, event.id);
  const questionnaire = getQuestionnaireForEvent(db, event.id, event.event_type);
  const proposedTimelineSteps = buildStepsFromQuestionnaire(
    questionnaire.data,
    event.event_type
  );
  const timelineItems = getTimelineItems(db, event.id);

  res.render("portal/plan-soiree", {
    title: `Plan de soirée — ${clientShortName(event)}`,
    event,
    questionnaire,
    proposedTimelineSteps,
    timelineItems,
    saved: req.query.saved === "1"
  });
});

app.post("/portal/:token/plan-soiree", async (req, res) => {
  const event = requirePortalEvent(req, res);
  if (!event) return;

  try {
    const questionnaire = getQuestionnaireForEvent(db, event.id, event.event_type);
    const before = JSON.parse(JSON.stringify(questionnaire.data));
    const data = { ...questionnaire.data };
    applyPlanSoireeFromBody(data, req.body, event.event_type);
    const changes = summarizePortalChanges({
      before,
      after: data,
      eventType: event.event_type,
      kind: "plan-soiree"
    });
    saveQuestionnaireForEvent(db, event.id, event.event_type, data);
    await notifyDjCarlClientUpdate({ db, event, kind: "plan-soiree", req, changes });
    res.redirect(`/portal/${req.params.token}/plan-soiree?saved=1`);
  } catch (err) {
    console.error(err);
    res.redirect(`/portal/${req.params.token}/plan-soiree`);
  }
});

app.post("/notifications/:id/read", (req, res) => {
  markPortalNotificationRead(db, Number(req.params.id));
  const back = req.body.returnTo || req.get("Referer") || "/";
  res.redirect(back);
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
  const returnTab = req.body.return_tab === "gestion" ? "gestion" : "notes";
  const params = { notesSaved: "1" };
  if (returnTab === "gestion") {
    params.gestion = req.body.gestion_section || req.body.save_scope || "location";
  }
  res.redirect(eventRedirect(eventId, returnTab, params));
});

app.post("/events/:id/questionnaire-sent", (req, res) => {
  const eventId = Number(req.params.id);
  if (!getEventById(db, eventId)) return res.status(404).send("Not found");
  saveDjNotes(db, eventId, { ...req.body, save_scope: "questionnaire_sent" });
  const returnTo = req.body.returnTo?.trim();
  res.redirect(returnTo || "/");
});

app.post("/events/:id/gestion/contrat/:subcontractor/save", (req, res) => {
  const eventId = Number(req.params.id);
  const subcontractor = req.params.subcontractor;
  if (!getEventById(db, eventId)) return res.status(404).send("Not found");
  if (!isValidSubcontractor(subcontractor)) return res.status(404).send("Not found");

  const result = saveSubcontractorContract(db, eventId, subcontractor, req.body);
  if (!result.ok) {
    return res.redirect(
      gestionRedirect(eventId, {
        gestion: "contrat",
        sousTraitant: subcontractor,
        contractError: result.error
      })
    );
  }
  res.redirect(
    gestionRedirect(eventId, {
      gestion: "contrat",
      sousTraitant: subcontractor,
      contractSaved: "1"
    })
  );
});

app.post("/events/:id/gestion/contrat/:subcontractor/clear", (req, res) => {
  const eventId = Number(req.params.id);
  const subcontractor = req.params.subcontractor;
  if (!getEventById(db, eventId)) return res.status(404).send("Not found");
  if (!isValidSubcontractor(subcontractor)) return res.status(404).send("Not found");

  deleteSubcontractorContract(db, eventId, subcontractor);
  res.redirect(
    gestionRedirect(eventId, {
      gestion: "contrat",
      sousTraitant: subcontractor,
      contractCleared: "1"
    })
  );
});

app.get("/signer/contrat/:token", (req, res) => {
  const match = getContractBySignToken(db, req.params.token);
  if (!match) {
    return res.status(404).render("error", {
      title: "Lien invalide",
      activeNav: "dashboard",
      message: "Ce lien de signature est invalide ou a expiré."
    });
  }

  res.render("contract-signer", {
    title: `Signature — ${match.subcontractorLabel}`,
    event: match.event,
    contract: match.contract,
    subcontractorLabel: match.subcontractorLabel,
    signToken: req.params.token,
    signed: req.query.signed === "1"
  });
});

app.post("/signer/contrat/:token", (req, res) => {
  const match = getContractBySignToken(db, req.params.token);
  if (!match) {
    return res.status(404).render("error", {
      title: "Lien invalide",
      activeNav: "dashboard",
      message: "Ce lien de signature est invalide ou a expiré."
    });
  }

  if (!req.body.signature_subcontractor?.trim()) {
    return res.redirect(`/signer/contrat/${req.params.token}?error=signature`);
  }

  saveSubcontractorSignatureOnly(
    db,
    match.eventId,
    match.subcontractorId,
    req.body.signature_subcontractor
  );
  res.redirect(`/signer/contrat/${req.params.token}?signed=1`);
});

app.get("/events/:id/gestion/contrat/:subcontractor/print", (req, res) => {
  const eventId = Number(req.params.id);
  const subcontractor = req.params.subcontractor;
  const event = getEventById(db, eventId);
  if (!event) return res.status(404).send("Not found");
  if (!isValidSubcontractor(subcontractor)) return res.status(404).send("Not found");

  const contract = getSubcontractorContract(db, eventId, subcontractor);
  const subcontractorLabel =
    SUBCONTRACTORS.find((s) => s.id === subcontractor)?.label || subcontractor;
  const pagePath = `/events/${eventId}/gestion/contrat/${subcontractor}/print`;
  const pageUrl = `${req.protocol}://${req.get("host")}${pagePath}`;
  const backUrl = `/events/${eventId}?tab=gestion&gestion=contrat&sousTraitant=${subcontractor}`;
  const downloadUrl = `${pagePath}?download=1`;
  const title = `Contrat ${subcontractorLabel} — ${clientShortName(event)}`;

  if (req.query.download === "1") {
    const safeName = clientShortName(event).replace(/[^\w\-]+/g, "-").replace(/-+/g, "-");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="contrat-${subcontractor}-${safeName}.html"`
    );
    return res.render("contract-download", {
      title,
      event,
      contract,
      subcontractorLabel: subcontractorLabel
    });
  }

  res.render("contract-print", {
    title,
    event,
    contract,
    subcontractorLabel,
    pageUrl,
    backUrl,
    downloadUrl
  });
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
  console.log(`Base SQLite : ${DB_PATH}${isPersistentStorage() ? " (persistante)" : ""}`);
});
