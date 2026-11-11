import type { WidgetKind } from "../../../contract/generated/contract";

const thumbnails = import.meta.glob<string>("../../assets/widgets/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
export function WidgetThumb({
  kind,
  icon = false,
}: {
  kind: WidgetKind;
  icon?: boolean;
}) {
  const source =
    thumbnails[`../../assets/widgets/${icon ? "w-" : ""}${kind}.svg`];
  return icon ? (
    <span
      aria-hidden="true"
      className="v-studio-widget-icon"
      style={{ maskImage: `url("${source}")` }}
    />
  ) : (
    <img
      alt=""
      aria-hidden="true"
      src={source}
      className="v-studio-widget-thumb"
    />
  );
}
export function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.8 8C4 2.7 12 2.7 14.2 8C12 13.3 4 13.3 1.8 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      {!visible && (
        <path d="m3 13 10-10" stroke="currentColor" strokeWidth="1.4" />
      )}
      <circle cx="7.9" cy="7.9" r="1.7" fill="currentColor" />
    </svg>
  );
}
