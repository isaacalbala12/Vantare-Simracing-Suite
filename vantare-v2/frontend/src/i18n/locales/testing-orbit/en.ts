/** `testing.*` catalogue for Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`). */
export const testingOrbitEn: Record<string, string> = {
  "testing.title": "Testing Center",
  "testing.lead": "Report a reproducible behaviour or validate an assigned fix.",
  "testing.unavailable": "Testing Center is not available on Stable",

  "testing.channel.nightly": "Nightly",
  "testing.channel.testers": "Testers",
  "testing.channel.stable": "Stable",

  "testing.draft.local": "Local draft",
  "testing.draft.saving": "Saving the draft…",
  "testing.draft.saved": "Draft saved",
  "testing.draft.error": "The draft could not be saved",

  "testing.form.title": "Report",
  "testing.form.privacy": "Only what you type here and what you tick under Consent is sent.",
  "testing.field.module": "Module",
  "testing.field.didWhat": "What you did",
  "testing.field.expected": "What you expected",
  "testing.field.observed": "What happened",
  "testing.field.context": "Extra context · optional",
  "testing.module.unknown": "Undetermined",

  "testing.consent.eyebrow": "Consent",
  "testing.consent.title": "Attached data",
  "testing.consent.lead": "Nothing is attached without an explicit choice and a preview.",
  "testing.consent.diagnostic": "Prepared diagnostic",
  "testing.consent.diagnosticHelp": "Builds a preview before sending.",
  "testing.consent.replay": "Telemetry replay",
  "testing.consent.replayUnavailable": "Not available in this flow.",
  "testing.consent.logs": "Product logs",
  "testing.consent.logsUnavailable": "There is no log buffer available.",

  "testing.preview.loading": "Preparing the diagnostic…",
  "testing.preview.ready": "Preview ready · {{bytes}} B · {{digest}}",
  "testing.preview.error": "The diagnostic could not be prepared; the report will be sent without it.",

  "testing.send": "Send report",
  "testing.sending": "Sending…",
  "testing.discard": "Discard draft",
  "testing.discard.warning": "The draft could not be deleted from disk.",
  "testing.retry.safe": "Retrying is safe: the report is not duplicated.",
  "testing.offline": "Offline: sending resumes when the connection is back.",

  "testing.validation.required": "At least three characters are needed.",
  "testing.validation.too_long": "The text is too long.",

  "testing.success.title": "Report sent",
  "testing.success.description": "Keep the identifier in case it needs following up.",

  "testing.error.permission": "Your account cannot send reports.",
  "testing.error.auth": "Sign in again to send the report.",
  "testing.error.conflict": "That report had already been sent.",
  "testing.error.generic": "The report could not be sent.",
};
