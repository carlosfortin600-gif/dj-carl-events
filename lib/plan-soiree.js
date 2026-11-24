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

function removeClientPlanStepAt(data, index) {
  const steps = Array.isArray(data?.client_plan?.steps) ? [...data.client_plan.steps] : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= steps.length) return false;
  steps.splice(i, 1);
  data.client_plan = { steps };
  return true;
}

function deactivateImportantMoment(data, momentKey) {
  const key = String(momentKey || "").trim();
  if (!key) return false;
  if (!Array.isArray(data.important_moments)) return false;
  let found = false;
  data.important_moments = data.important_moments.map((moment) => {
    if (moment.key !== key) return moment;
    found = true;
    return { ...moment, active: "no" };
  });
  return found;
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
  mergeClientPlan,
  removeClientPlanStepAt,
  deactivateImportantMoment
};
