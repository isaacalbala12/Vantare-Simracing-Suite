import { exact, oneOf, record } from "./validation-common";

function text(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length <= limit;
}
export function isUpdates(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, [
      "installation",
      "version",
      "channel",
      "previous",
      "beta",
      "registrationWarning",
      "news",
      "restartAvailable",
    ])
  )
    return false;
  const beta = value.beta;
  return (
    oneOf(value.installation, ["development", "installed", "invalid"]) &&
    text(value.version, 128) &&
    text(value.channel, 32) &&
    typeof value.previous === "boolean" &&
    typeof value.restartAvailable === "boolean" &&
    (value.registrationWarning === null ||
      text(value.registrationWarning, 8192)) &&
    (beta === null ||
      (record(beta) &&
        exact(beta, [
          "schema",
          "state",
          "message",
          "version",
          "notes",
          "rejectedVersion",
        ]) &&
        beta.schema === 1 &&
        text(beta.state, 64) &&
        text(beta.message, 8192) &&
        text(beta.version, 32) &&
        text(beta.notes, 8192) &&
        (beta.rejectedVersion === null || text(beta.rejectedVersion, 32)))) &&
    Array.isArray(value.news) &&
    value.news.length <= 256 &&
    value.news.every(
      (note: unknown) =>
        record(note) &&
        exact(note, [
          "schemaVersion",
          "tag",
          "channel",
          "title",
          "summary",
          "kind",
        ]) &&
        note.schemaVersion === 1 &&
        text(note.tag, 128) &&
        oneOf(note.channel, ["master", "testers", "nightly"]) &&
        text(note.title, 512) &&
        text(note.summary, 8192) &&
        oneOf(note.kind, ["Nuevo", "Mejora", "Arreglo"]),
    )
  );
}
