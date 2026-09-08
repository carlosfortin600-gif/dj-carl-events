function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value) {
  const digits = digitsOnly(value).slice(0, 10);
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatPhoneInput(value) {
  return normalizePhone(value);
}

function telDigits(value) {
  let digits = digitsOnly(value);
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

function telHref(value) {
  const digits = telDigits(value);
  if (digits.length < 10) return null;
  return `tel:+1${digits}`;
}

function formatPhoneDisplay(value) {
  const formatted = normalizePhone(value);
  return formatted || String(value || "").trim() || "—";
}

module.exports = {
  digitsOnly,
  telDigits,
  normalizePhone,
  formatPhoneInput,
  telHref,
  formatPhoneDisplay
};
