/**
 * Contrato de desbordamiento horizontal de la shell Orbit.
 *
 * La build real añade `hub` al `body` (`HubApp`), que suelta el `overflow` de
 * la página: por eso las barras horizontales solo se veían allí y no en los
 * harness. El assert reproduce esa clase, comprueba que la página no hace
 * scroll en X y que ningún contenedor de la shell desborda por el eje que no
 * debe desplazarse.
 *
 * Se desplazan a propósito (y por eso están permitidos): el lienzo del Studio
 * (`orbit-studio-stage-wrap`), la línea de tiempo del kit (`orbit-tl`) y las
 * tablas anchas que declaran su propio `overflow-x`.
 */
const ALLOWED = [
  "orbit-studio-stage-wrap",
  "orbit-tl",
  "orbit-strategy-table",
  "orbit-telemetry-scroll",
];

export async function assertNoHorizontalOverflow(page, name) {
  const report = await page.evaluate((allowed) => {
    const body = document.body;
    const hadHub = body.classList.contains("hub");
    if (!hadHub) body.classList.add("hub");
    const offenders = [];
    for (const node of document.querySelectorAll(".orbit-root *")) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.clientWidth <= 0) continue;
      if (node.scrollWidth <= node.clientWidth + 1) continue;
      const overflowX = getComputedStyle(node).overflowX;
      // `visible` no saca barra: solo molesta si un ancestro con `auto` la hereda.
      if (overflowX !== "auto" && overflowX !== "scroll") continue;
      const classes = [...node.classList];
      if (classes.some((entry) => allowed.includes(entry))) continue;
      offenders.push(`${node.tagName.toLowerCase()}.${classes.join(".")} ${node.scrollWidth}>${node.clientWidth}`);
    }
    // Con el escalado de Orbit (D-R4-3) `<html>` lleva `zoom`: su propia caja
    // sigue midiendo el viewport real, pero todo lo que cuelga de ella se mide
    // en px de maquetación (a 870 px de ventana, `body.clientWidth` es 1180).
    // Comparar ambos contra `window.innerWidth` mezclaba los dos espacios y
    // daba falsos positivos. Cada elemento se compara contra **su propia** caja
    // de cliente, que es lo que de verdad significa «esto saca barra»; sin zoom
    // los números son los mismos que antes.
    const page = {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: document.documentElement.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
    };
    if (!hadHub) body.classList.remove("hub");
    return { offenders, page };
  }, ALLOWED);

  if (report.page.scrollWidth > report.page.innerWidth) {
    throw new Error(
      `${name}: la página hace scroll horizontal (${report.page.scrollWidth} > ${report.page.innerWidth})`,
    );
  }
  if (report.page.bodyScrollWidth > report.page.bodyClientWidth + 1) {
    throw new Error(
      `${name}: el body hace scroll horizontal (${report.page.bodyScrollWidth} > ${report.page.bodyClientWidth})`,
    );
  }
  if (report.offenders.length > 0) {
    throw new Error(`${name}: hay contenedores con barra horizontal\n${report.offenders.join("\n")}`);
  }
}
