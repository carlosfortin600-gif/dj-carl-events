const { escapeHtml } = require("./helpers");
const { EMAIL_COPY_TO } = require("./email-copy-to");
const { telHref, formatPhoneDisplay } = require("./phone");

const DJ_CARL_WEBSITE =
  process.env.DJ_CARL_WEBSITE?.trim().replace(/\/$/, "") || "https://www.djcarl.ca";
const DJ_CARL_WEBSITE_LABEL = "www.djcarl.ca";
const DJ_CARL_CONTACT_EMAIL =
  process.env.DJ_CARL_CONTACT_EMAIL?.trim() || EMAIL_COPY_TO || "pro@djcarl.ca";
const DJ_CARL_CONTACT_PHONE = formatPhoneDisplay(
  process.env.DJ_CARL_CONTACT_PHONE?.trim() || "418-806-1235"
);

function emailClientContactLabel() {
  const parts = [];
  if (DJ_CARL_CONTACT_PHONE && DJ_CARL_CONTACT_PHONE !== "—") {
    parts.push(DJ_CARL_CONTACT_PHONE);
  }
  if (DJ_CARL_CONTACT_EMAIL) parts.push(DJ_CARL_CONTACT_EMAIL);
  return parts.join(" · ");
}

function emailClientSignatureText(leadLine) {
  const parts = [];
  if (leadLine) parts.push(leadLine, "");
  parts.push("DJ Carl", DJ_CARL_WEBSITE_LABEL);
  if (DJ_CARL_CONTACT_PHONE && DJ_CARL_CONTACT_PHONE !== "—") {
    parts.push(DJ_CARL_CONTACT_PHONE);
  }
  parts.push(DJ_CARL_CONTACT_EMAIL);
  return parts.join("\n");
}

function emailClientSignatureHtml(leadHtml) {
  const lead = leadHtml ? `${leadHtml}\n` : "";
  const tel = telHref(DJ_CARL_CONTACT_PHONE);
  const phoneLine =
    DJ_CARL_CONTACT_PHONE && DJ_CARL_CONTACT_PHONE !== "—"
      ? tel
        ? `<a href="${escapeHtml(tel)}" style="color:#0d6efd;">${escapeHtml(DJ_CARL_CONTACT_PHONE)}</a><br>`
        : `${escapeHtml(DJ_CARL_CONTACT_PHONE)}<br>`
      : "";
  return `${lead}<p style="margin-top:4px;"><strong>DJ Carl</strong><br>
<a href="${escapeHtml(DJ_CARL_WEBSITE)}" style="color:#0d6efd;">${escapeHtml(DJ_CARL_WEBSITE_LABEL)}</a><br>
${phoneLine}<a href="mailto:${escapeHtml(DJ_CARL_CONTACT_EMAIL)}" style="color:#0d6efd;">${escapeHtml(DJ_CARL_CONTACT_EMAIL)}</a></p>`;
}

function resolvePublicAppBaseUrl() {
  return (
    process.env.PUBLIC_URL?.trim().replace(/\/$/, "") ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}

function resolveEmailLogoUrl() {
  return `${resolvePublicAppBaseUrl()}/img/logo-dj-carl.png`;
}

function emailLogoHtml(logoUrl) {
  const url = String(logoUrl || "").trim();
  if (!url) return "";
  return `<div style="text-align:center;margin:0 0 24px;">
<img src="${url.replace(/"/g, "&quot;")}" alt="DJ Carl" width="120" height="120" style="display:block;margin:0 auto;border-radius:50%;">
</div>`;
}

module.exports = {
  DJ_CARL_WEBSITE,
  DJ_CARL_WEBSITE_LABEL,
  DJ_CARL_CONTACT_EMAIL,
  DJ_CARL_CONTACT_PHONE,
  emailClientContactLabel,
  emailClientSignatureText,
  emailClientSignatureHtml,
  resolvePublicAppBaseUrl,
  resolveEmailLogoUrl,
  emailLogoHtml
};
