const { yn, isWeddingEvent } = require("./questionnaire-shared");
const { compareLateTime } = require("./late-time");

function comparePlanTime(a, b) {
  return compareLateTime(a, b);
}

function parseClientPlanSteps(body) {
  const steps = [];
  let i = 0;
  while (
    Object.prototype.hasOwnProperty.call(body, `client_plan_time_${i}`) ||
    Object.prototype.hasOwnProperty.call(body, `client_plan_title_${i}`) ||
    Object.prototype.hasOwnProperty.call(body, `client_plan_desc_${i}`)
  ) {
    const time = String(body[`client_plan_time_${i}`] || "").trim();
    const title = String(body[`client_plan_title_${i}`] || "").trim();
    const description = String(body[`client_plan_desc_${i}`] || "").trim();
    if (title || time || description) {
      steps.push({ time, title, description });
    }
    i += 1;
  }
  return steps.sort((a, b) => comparePlanTime(a.time, b.time));
}

function parseImportantMoments(body, eventType) {
  const keys = isWeddingEvent(eventType)
    ? require("./questionnaire").MOMENT_KEYS
    : require("./party-questionnaire").PARTY_MOMENT_KEYS;
  return keys.map((m) => ({
    key: m.key,
    label: m.label,
    active: yn(body[`moment_${m.key}_active`]),
    time: body[`moment_${m.key}_time`] || "",
    song: body[`moment_${m.key}_song`] || "",
    notes: body[`moment_${m.key}_notes`] || ""
  }));
}

function applyPlanSoireeFromBody(data, body, eventType) {
  data.important_moments = parseImportantMoments(body, eventType);
  data.client_plan = { steps: parseClientPlanSteps(body) };
  if (!data.general || typeof data.general !== "object") {
    data.general = {};
  }
  if (Object.prototype.hasOwnProperty.call(body, "expected_end_time")) {
    data.general.expected_end_time = String(body.expected_end_time || "").trim();
  }
  return data;
}

function defaultClientPlan() {
  return { steps: [] };
}

function mergeClientPlan(stored) {
  const base = defaultClientPlan();
  if (!stored || typeof stored !== "object") return base;
  const steps = Array.isArray(stored.steps)
    ? stored.steps.map((step) => ({
        time: step.time || "",
        title: step.title || "",
        description: step.description || ""
      }))
    : [];
  return { steps };
}

module.exports = {
  parseClientPlanSteps,
  parseImportantMoments,
  applyPlanSoireeFromBody,
  defaultClientPlan,
  mergeClientPlan
};
