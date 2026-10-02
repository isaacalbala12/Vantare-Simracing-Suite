export function mapAuthoringWidgetColumns(
  content: Record<string, unknown>,
  mapColumn: (column: Record<string, unknown>) => Record<string, unknown>,
): unknown {
  return Array.isArray(content.columns)
    ? (content.columns as Record<string, unknown>[]).map(mapColumn)
    : content.columns;
}
