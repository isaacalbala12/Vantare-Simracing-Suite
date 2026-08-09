import { createContext } from "react";

/**
 * The element V52Shell reserves directly under the global nav, so that a page
 * can render its own navigation attached to it.
 *
 * The shell hands the node down instead of the page looking it up by id: a
 * lookup would have to happen after mount, and re-rendering the page to react
 * to a DOM query is a worse trade than passing the node the shell already has.
 * `null` means no shell, and HubSubnav then renders in place.
 */
export const HubSubnavSlotContext = createContext<HTMLElement | null>(null);
