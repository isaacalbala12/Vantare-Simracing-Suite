/** Decorative action drawings from the approved variante-a.html menu. */
export function MoreActionIcon({
  action,
}: {
  action: "place" | "obs" | "remove";
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {action === "place" ? (
        <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
      ) : action === "obs" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="8" r="2.4" />
          <circle cx="8.4" cy="14" r="2.4" />
          <circle cx="15.6" cy="14" r="2.4" />
        </>
      ) : (
        <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />
      )}
    </svg>
  );
}
