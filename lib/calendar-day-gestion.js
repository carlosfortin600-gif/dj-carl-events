const { formatDateTimeRangeFr } = require("./helpers");
const { SUBCONTRACTORS, parseContractData } = require("./subcontractor-contracts");

function dateInRange(iso, startDate, endDate) {
  if (!startDate) return false;
  const end = endDate || startDate;
  return iso >= startDate && iso <= end;
}

function trailerActive(row) {
  return (
    row.tech_trailer_needed === "yes" ||
    row.tech_trailer_start ||
    row.tech_trailer_end
  );
}

function roomActive(row) {
  if (row.tech_room_needed === "no") return false;
  return row.tech_room_needed === "yes" || roomHasData(row);
}

function roomDisplayYes(row) {
  if (row.tech_room_needed === "no") return false;
  return row.tech_room_needed === "yes" || roomHasData(row);
}

function roomHasData(row) {
  return !!(row.tech_room_location || row.tech_room_start || row.tech_room_end);
}

function gestionLocationUrl(eventId) {
  return `/events/${eventId}?tab=gestion&gestion=location`;
}

function gestionEventUrl(eventId) {
  return `/events/${eventId}?tab=gestion`;
}

function buildTrailerSummary(row) {
  const period = formatDateTimeRangeFr(
    row.tech_trailer_start,
    row.tech_trailer_start_time,
    row.tech_trailer_end || row.tech_trailer_start,
    row.tech_trailer_end_time
  );
  return `Location de trailer${period && period !== "—" ? ` (${period})` : ""}`;
}

function buildRoomSummaryYes(row) {
  const period = formatDateTimeRangeFr(
    row.tech_room_start,
    row.tech_room_start_time,
    row.tech_room_end || row.tech_room_start,
    row.tech_room_end_time
  );
  const place = row.tech_room_location?.trim() || "";
  const base = place ? `Location de chambre — ${place}` : "Location de chambre";
  return `${base}${period && period !== "—" ? ` (${period})` : ""}`;
}

function getDayGestionDetails(db, dateIso) {
  const noteRows = db
    .prepare(
      `SELECT e.id AS event_id, e.event_date, e.event_type,
              n.tech_trailer_needed,
              n.tech_trailer_start, n.tech_trailer_start_time,
              n.tech_trailer_end, n.tech_trailer_end_time,
              n.tech_room_needed, n.tech_room_location,
              n.tech_room_start, n.tech_room_start_time,
              n.tech_room_end, n.tech_room_end_time
       FROM events e
       LEFT JOIN dj_notes n ON n.event_id = e.id
       WHERE e.deleted_at IS NULL`
    )
    .all();

  const locations = [];
  const seenLocationKeys = new Set();

  const pushLocation = (item) => {
    const key = `${item.type}:${item.eventId}:${item.summary}`;
    if (seenLocationKeys.has(key)) return;
    seenLocationKeys.add(key);
    locations.push(item);
  };

  for (const row of noteRows) {
    if (trailerActive(row)) {
      const start = row.tech_trailer_start;
      const end = row.tech_trailer_end || row.tech_trailer_start;
      if (dateInRange(dateIso, start, end)) {
        pushLocation({
          type: "trailer",
          eventId: row.event_id,
          summary: buildTrailerSummary(row),
          gestionUrl: gestionLocationUrl(row.event_id)
        });
      }
    }
  }

  for (const row of noteRows) {
    if (row.event_date !== dateIso) continue;

    if (roomDisplayYes(row)) {
      pushLocation({
        type: "room",
        eventId: row.event_id,
        summary: buildRoomSummaryYes(row),
        gestionUrl: gestionLocationUrl(row.event_id)
      });
    } else {
      pushLocation({
        type: "room-none",
        eventId: row.event_id,
        summary: "Location de chambre — Non",
        gestionUrl: gestionLocationUrl(row.event_id)
      });
    }
  }

  for (const row of noteRows) {
    if (row.event_date === dateIso) continue;
    if (!roomActive(row)) continue;

    const start = row.tech_room_start;
    const end = row.tech_room_end || row.tech_room_start;
    if (dateInRange(dateIso, start, end)) {
      pushLocation({
        type: "room",
        eventId: row.event_id,
        summary: buildRoomSummaryYes(row),
        gestionUrl: gestionLocationUrl(row.event_id)
      });
    }
  }

  locations.sort((a, b) => a.summary.localeCompare(b.summary, "fr"));

  const contractRows = db
    .prepare(
      `SELECT sc.subcontractor_id, sc.data,
              e.id AS event_id, e.event_date, e.event_type
       FROM subcontractor_contracts sc
       JOIN events e ON e.id = sc.event_id
       WHERE e.deleted_at IS NULL
         AND e.event_date = ?`
    )
    .all(dateIso);

  const contracts = contractRows.map((row) => {
    const data = parseContractData(row.data);
    const sub = SUBCONTRACTORS.find((s) => s.id === row.subcontractor_id);
    const amount = data.amount?.trim() || "";
    const service = data.service_description?.trim() || "";
    const serviceShort = service.length > 60 ? `${service.slice(0, 57)}…` : service;
    let summary = `Contrat ${data.full_name || sub?.label || row.subcontractor_id} (${row.event_type})`;
    if (amount) summary += ` — ${amount}`;
    if (serviceShort) summary += ` — ${serviceShort}`;

    return {
      eventId: row.event_id,
      summary,
      gestionUrl: gestionEventUrl(row.event_id)
    };
  });

  contracts.sort((a, b) => a.summary.localeCompare(b.summary, "fr"));

  return { locations, contracts };
}

module.exports = {
  getDayGestionDetails
};
