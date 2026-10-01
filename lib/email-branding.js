const { escapeHtml } = require("./helpers");
const { EMAIL_COPY_TO } = require("./email-copy-to");

const DJ_CARL_WEBSITE =
  process.env.DJ_CARL_WEBSITE?.trim().replace(/\/$/, "") || "https://djcarl.ca";
const DJ_CARL_CONTACT_EMAIL =
  process.env.DJ_CARL_CONTACT_EMAIL?.trim() || EMAIL_COPY_TO || "pro@djcarl.ca";

function emailClientSignatureText(leadLine) {
  const parts = [];
  if (leadLine) parts.push(leadLine, "");
  parts.push("DJ Carl", DJ_CARL_WEBSITE, DJ_CARL_CONTACT_EMAIL);
  return parts.join("\n");
}

function emailClientSignatureHtml(leadHtml) {
  const lead = leadHtml ? `${leadHtml}\n` : "";
  return `${lead}<p style="margin-top:4px;"><strong>DJ Carl</strong><br>
<a href="${escapeHtml(DJ_CARL_WEBSITE)}" style="color:#0d6efd;">djcarl.ca</a><br>
<a href="mailto:${escapeHtml(DJ_CARL_CONTACT_EMAIL)}" style="color:#0d6efd;">${escapeHtml(DJ_CARL_CONTACT_EMAIL)}</a></p>`;
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
  DJ_CARL_CONTACT_EMAIL,
  emailClientSignatureText,
  emailClientSignatureHtml,
  resolvePublicAppBaseUrl,
  resolveEmailLogoUrl,
  emailLogoHtml
};
