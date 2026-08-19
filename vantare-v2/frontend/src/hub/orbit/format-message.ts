/**
 * Interpolación `{{clave}}` sobre las cadenas del catálogo.
 *
 * `useI18n().t` devuelve la cadena cruda; el catálogo de Orbit
 * (`14-i18n.md`) usa `{{n}}`, `{{plan}}`, `{{time}}`… así que la sustitución
 * vive aquí en vez de repartirse por los componentes.
 */
export function formatMessage(
  template: string,
  values: Record<string, string | number> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
