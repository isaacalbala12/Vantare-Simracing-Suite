/** Capture-bank copy only; the wire contract deliberately has no QA status field. */
export function testingParticipationLabel(fallback: string, scene?: string) {
  const name =
    scene ?? new URLSearchParams(window.location.search).get("escena");
  return [
    "testing-tester-questionnaires-reference",
    "testing-tester-community-reference",
  ].includes(name ?? "")
    ? "QA · ejemplo de participación, sin backend ni envío"
    : fallback;
}
