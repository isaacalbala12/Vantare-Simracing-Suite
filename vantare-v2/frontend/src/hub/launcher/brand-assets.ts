/**
 * Activos de marca dibujados en el propio repositorio.
 *
 * Solo entran aquí las aplicaciones cuyo icono instalado **no** es su marca y
 * no hay ningún fichero local del que sacarla. Todo lo demás se resuelve con el
 * icono real del ejecutable, que siempre es más fiel que un redibujado.
 *
 * Son SVG en un `data:` URI: no salen a la red (el hub no descarga logotipos de
 * terceros), escalan a cualquier losa sin perder nitidez y no añaden binarios al
 * repositorio.
 */

/**
 * `data:` URI de un SVG. Se codifica con `encodeURIComponent` en vez de base64
 * para que el activo siga siendo legible y editable en el diff; `#` y `"` han de
 * ir escapados o el navegador corta el URI.
 */
function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

/**
 * MoTeC — logotipo de la marca.
 *
 * El catálogo detecta `…\MoTeC\app.exe`, que es el visor **i2**: su icono son
 * los dos círculos cian y ámbar, y en la losa la aplicación parecía ser i2 en
 * vez de MoTeC. La instalación no trae ningún fichero con el logotipo
 * corporativo (`MoTeC.Extract.exe` lleva la marca del producto M1 y
 * `MoTeC.Discovery.exe` un icono de 32 px), así que el logotipo se dibuja aquí:
 * el wordmark en cursiva pesada sobre negro, que es como la marca se presenta.
 *
 * Es una reconstrucción, no el fichero oficial. Si aparece el activo aprobado,
 * se sustituye esta constante y nada más cambia.
 */
const MOTEC_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img">
  <rect width="256" height="256" rx="52" fill="#0c0c0d"/>
  <rect x="6" y="6" width="244" height="244" rx="46" fill="none" stroke="#26262a" stroke-width="4"/>
  <text x="128" y="152" text-anchor="middle" textLength="196" lengthAdjust="spacingAndGlyphs"
    font-family="'Arial Narrow','Helvetica Neue',Arial,sans-serif" font-size="86"
    font-weight="700" font-style="italic" fill="#ffffff">MoTeC</text>
  <rect x="30" y="176" width="196" height="10" rx="5" fill="#e01a22"/>
</svg>`;

export const MOTEC_BRAND_ICON = svgDataUri(MOTEC_SVG);
