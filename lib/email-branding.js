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
  resolvePublicAppBaseUrl,
  resolveEmailLogoUrl,
  emailLogoHtml
};
