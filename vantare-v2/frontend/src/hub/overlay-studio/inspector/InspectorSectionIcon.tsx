import type { InspectorSectionId } from "../../../overlay/core/widget-definition";

// Iconos del carril del inspector. SVG en linea a proposito: el resto del
// Studio evita recursos remotos -- la app funciona sin conexion -- y trazar con
// currentColor deja que el estado activo lo decida el CSS sin duplicar reglas.
//
// Antes cada seccion pintaba el mismo rectangulo gris de 16x8 y solo dos de las
// seis se distinguian, unicamente cuando estaban activas: el carril no decia
// nada hasta que pinchabas.
const PATHS: Record<InspectorSectionId, React.ReactElement> = {
  // Paleta: elegir un diseno.
  design: (
    <>
      <path d="M8 1.5a6.5 6.5 0 0 0 0 13c.9 0 1.4-.6 1.4-1.3 0-.8-.6-1.2-.6-1.9 0-.5.4-.9 1-.9h1.3A3.4 3.4 0 0 0 14.5 7c0-3-2.9-5.5-6.5-5.5Z" />
      <circle cx="5" cy="6" r="1" />
      <circle cx="8" cy="4.5" r="1" />
      <circle cx="11" cy="6" r="1" />
    </>
  ),
  // Circulo mitad lleno: contraste y color.
  appearance: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5v11a5.5 5.5 0 0 0 0-11Z" />
    </>
  ),
  // Lineas de texto: que datos muestra.
  content: (
    <>
      <path d="M3 4.5h10M3 8h10M3 11.5h6" />
    </>
  ),
  // Rayo: cuando y a que ritmo se actualiza.
  behavior: (
    <>
      <path d="M9 1.5 4 9h3.5L7 14.5 12 7H8.5L9 1.5Z" />
    </>
  ),
  // Esquinas de encuadre: posicion y tamano.
  layout: (
    <>
      <path d="M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3" />
    </>
  ),
  // Deslizadores: acciones sobre el widget.
  actions: (
    <>
      <path d="M3 5h10M3 11h10" />
      <circle cx="6" cy="5" r="1.6" />
      <circle cx="10" cy="11" r="1.6" />
    </>
  ),
};

export function InspectorSectionIcon(props: { sectionId: InspectorSectionId }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-section={props.sectionId}
    >
      {PATHS[props.sectionId]}
    </svg>
  );
}
