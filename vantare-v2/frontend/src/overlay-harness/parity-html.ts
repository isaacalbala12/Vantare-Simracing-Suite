export function normalizeRendererHtml(html: string): string {
  return html
    .replace(/\sdata-render-mode="[^"]*"/g, "")
    .replace(/\sdata-testid="[^"]*"/g, "")
    .replace(/\sstyle="[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function readRendererMarkup(root: ParentNode, widgetType: string): string | null {
  const renderer = root.querySelector(`[data-widget-renderer="${widgetType}"]`);
  return renderer ? normalizeRendererHtml(renderer.outerHTML) : null;
}