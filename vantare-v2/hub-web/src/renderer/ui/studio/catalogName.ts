import { studioText } from "../../i18n/studio";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Matches one catalogue card by the action and widget name that open its
 * accessible name: "Añadir <name>, <visible text of the card>".
 */
export function catalogCardName(name: string) {
  return new RegExp(
    `^${escapeRegExp(`${studioText.addShort} ${name}`)}(?:,|$)`,
  );
}
