/**
 * Ids de los huecos que la shell Orbit reserva por página (briefings 04 y 05).
 *
 * Viven en un módulo propio, separado de cada página, para que la shell pueda
 * referenciarlos sin importar el código de la pantalla: las páginas se cargan
 * con React.lazy y este módulo tiene que viajar en el chunk inicial.
 */

export const LAUNCHER_CONTEXT_SLOT_ID = "orbit-launcher-context-slot";
export const LAUNCHER_TOPBAR_SLOT_ID = "orbit-launcher-topbar-slot";
export const RACES_CONTEXT_SLOT_ID = "orbit-races-context-slot";
export const RACES_TOPBAR_SLOT_ID = "orbit-races-topbar-slot";
export const STRATEGY_CONTEXT_SLOT_ID = "orbit-strategy-context-slot";
export const TELEMETRY_CONTEXT_SLOT_ID = "orbit-telemetry-context-slot";
export const ROADMAP_CONTEXT_SLOT_ID = "orbit-roadmap-context-slot";
export const SETTINGS_CONTEXT_SLOT_ID = "orbit-settings-context-slot";
