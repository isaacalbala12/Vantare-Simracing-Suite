export const studioDropText = {
  help: "Arrastra un widget al lienzo o pulsa Añadir para colocarlo en un hueco libre.",
  drag: (name: string) => `Añadir o arrastrar ${name} al lienzo`,
  dragHelp:
    "Arrastra hasta el lienzo. Con teclado, pulsa Intro para añadir en un hueco libre.",
  release: "Suelta para añadir",
  outside: "Coloca el widget dentro del lienzo para añadirlo",
  snapped: "Imán",
  cancel: "Arrastre cancelado. No se ha añadido ningún widget.",
  added: (name: string) => `${name} añadido al lienzo.`,
  readonly:
    "No puedes añadir mientras los overlays estén en pista o falte acceso al diseño.",
};
