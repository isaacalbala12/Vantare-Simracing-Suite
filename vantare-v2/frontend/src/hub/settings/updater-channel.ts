import type { VantareBuildChannel } from "../testing-center/contracts";
import type { Channel } from "./settings-contract";

/**
 * Canal del actualizador → resto de la app.
 *
 * El canal vivía entero dentro de `useUpdaterSettings`, así que elegirlo en
 * Ajustes no llegaba a ningún otro sitio: el rail seguía decidiendo si enseña
 * el Testing Center a partir del canal con el que se compiló el binario, y ese
 * dato solo cambia reinstalando. Con este evento la elección viaja por el mismo
 * bus que todo lo demás y la shell la recibe sin recargar (B4).
 *
 * Es un evento de frontend: no hay handler Go escuchándolo. El guardado real
 * sigue siendo `updater:settings:save` y la relectura `updater:settings:get`.
 */
export const UPDATER_CHANNEL_EVENT = "hub:updater-channel";

export type UpdaterChannelEvent = { channel: Channel };

/**
 * El actualizador habla de `stable`; el Testing Center y `app:version` hablan
 * de `master` para esa misma rama. Es la única diferencia entre ambos nombres.
 */
export function buildChannelOf(channel: Channel): VantareBuildChannel {
  return channel === "stable" ? "master" : channel;
}
