const EMAIL_COPY_TO =
  process.env.CONFIRMATION_EMAIL_COPY_TO?.trim() ||
  process.env.EMAIL_COPY_TO?.trim() ||
  "pro@djcarl.ca";

function getEmailCopyTo() {
  return EMAIL_COPY_TO;
}

module.exports = {
  EMAIL_COPY_TO,
  getEmailCopyTo,
  getConfirmationEmailCopyTo: getEmailCopyTo
};
