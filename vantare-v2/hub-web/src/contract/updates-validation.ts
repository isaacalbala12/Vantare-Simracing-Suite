import {
  installationStates,
  releaseChannels,
  releaseKinds,
  updatesLimits,
} from "./generated/contract";
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
    oneOf(value.installation, installationStates) &&
    text(value.version, updatesLimits.tag) &&
    text(value.channel, updatesLimits.shortVersion) &&
    typeof value.previous === "boolean" &&
    typeof value.restartAvailable === "boolean" &&
    (value.registrationWarning === null ||
      text(value.registrationWarning, updatesLimits.text)) &&
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
        text(beta.state, updatesLimits.state) &&
        text(beta.message, updatesLimits.text) &&
        text(beta.version, updatesLimits.shortVersion) &&
        text(beta.notes, updatesLimits.text) &&
        (beta.rejectedVersion === null ||
          text(beta.rejectedVersion, updatesLimits.shortVersion)))) &&
    Array.isArray(value.news) &&
    value.news.length <= updatesLimits.news &&
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
        text(note.tag, updatesLimits.tag) &&
        oneOf(note.channel, releaseChannels) &&
        text(note.title, updatesLimits.title) &&
        text(note.summary, updatesLimits.text) &&
        oneOf(note.kind, releaseKinds),
    )
  );
}
