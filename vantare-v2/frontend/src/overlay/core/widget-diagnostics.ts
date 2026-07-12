export type WidgetDiagnosticSurface = "studio" | "desktop" | "obs" | "harness";

export type WidgetDiagnostic = {
  code: string;
  widgetId?: string;
  widgetType?: string;
  systemId?: string;
  surface: WidgetDiagnosticSurface;
  message: string;
  occurredAt: string;
};

export type WidgetDiagnosticCollector = {
  report(diagnostic: WidgetDiagnostic): void;
  list(): readonly WidgetDiagnostic[];
  counts(): Readonly<Record<string, number>>;
  clear(): void;
};

export function createWidgetDiagnosticCollector(limit = 100): WidgetDiagnosticCollector {
  const maxEntries = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 100;
  const entries: WidgetDiagnostic[] = [];

  return {
    report(diagnostic) {
      entries.push({ ...diagnostic });
      if (entries.length > maxEntries) {
        entries.splice(0, entries.length - maxEntries);
      }
    },
    list() {
      return entries.slice();
    },
    counts() {
      return entries.reduce<Record<string, number>>((result, entry) => {
        result[entry.code] = (result[entry.code] ?? 0) + 1;
        return result;
      }, {});
    },
    clear() {
      entries.length = 0;
    },
  };
}
