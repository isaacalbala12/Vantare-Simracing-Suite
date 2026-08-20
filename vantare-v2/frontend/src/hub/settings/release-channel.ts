import type { Channel, ChannelReleases, Release } from "./settings-contract";

/**
 * A qué canal pertenece una release, leído de su tag.
 *
 * Espejo de `ReleaseChannel` en internal/updater/updater.go: no basta con
 * `prerelease` para separar testers de nightly, así que las dos tarjetas de
 * pre-release enseñaban la MISMA release (la primera prerelease de la lista,
 * normalmente una nightly). El marcador está en el tag o en el nombre.
 *
 * Una prerelease sin marcador conocido no pertenece a ningún canal: devolvemos
 * `null` y no se enseña en ninguna tarjeta, igual que el backend falla cerrado.
 */
export function releaseChannelOf(release: Release): Channel | null {
  if (!release.prerelease) return "stable";
  const marker = `${release.tag_name ?? ""} ${release.name ?? ""}`.toLowerCase();
  if (marker.includes("nightly")) return "nightly";
  if (marker.includes("testers")) return "testers";
  return null;
}

/**
 * Última release de cada canal a partir de una lista ya ordenada de más nueva a
 * más vieja (es el orden que garantiza el backend).
 *
 * Es el plan B para binarios viejos que aún no mandan `info.channels`: sobre una
 * lista filtrada por el canal del usuario los canales superiores saldrán vacíos,
 * pero nunca cruzados.
 */
export function latestPerChannel(releases: readonly Release[]): ChannelReleases {
  const summary: ChannelReleases = {};
  for (const release of releases) {
    const channel = releaseChannelOf(release);
    if (!channel) continue;
    if (!summary[channel]) summary[channel] = release;
  }
  return summary;
}

/**
 * La release que le toca a una tarjeta de canal: el resumen del backend manda,
 * y si no llega se deriva de la lista de releases con el clasificador local.
 */
export function channelRelease(
  channel: Channel,
  info: { channels?: ChannelReleases; releases?: Release[] } | null | undefined,
): Release | null {
  const summary = info?.channels ?? latestPerChannel(info?.releases ?? []);
  return summary[channel] ?? null;
}
