/** Native DIP client size; browser QA uses CSS zoom, which leaves inner size intact. */
export function viewportSize() {
  return (
    window.vantare?.viewport?.() ?? {
      width: window.innerWidth,
      height: window.innerHeight,
    }
  );
}
