# Calendario y editor de aplicaciones: seguridad de los cajones

## Auditoría y decisión

| Capa                   | Implementación                      | Antes                                              | Ahora                                                       |
| ---------------------- | ----------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Ficha                  | `ui/CalendarDetail.tsx`             | Base UI no modal con backdrop                      | `WindowDialog`, ámbito de pantalla                          |
| Avisos                 | `ui/CalendarAlertsDialog.tsx`       | Base UI no modal con backdrop                      | `WindowDialog`, ámbito de pantalla                          |
| ICS                    | `ui/CalendarIcsDialog.tsx`          | Base UI no modal con backdrop                      | `WindowDialog`, ámbito de pantalla                          |
| Ampliar Día            | `ui/CalendarDayView.tsx`            | Base UI no modal con backdrop                      | `WindowDialog`, ámbito de pantalla                          |
| Ampliar Semana         | `ui/CalendarWeekView.tsx`           | Base UI no modal con backdrop                      | `WindowDialog`, ámbito de pantalla                          |
| Ampliar Mes            | `ui/CalendarMonthView.tsx`          | Base UI no modal con backdrop                      | `WindowDialog`, ámbito de pantalla                          |
| Editor de aplicaciones | `screens/launcher/Applications.tsx` | Sustituía el catálogo; sin Escape ni ciclo de foco | Cajón de 480 px, catálogo conservado detrás, `WindowDialog` |

Las seis capas del Calendario ya tapaban con backdrop el contenido situado bajo
la barra superior. La Ficha también contiene acciones de lanzamiento, seguimiento
y cambios de avisos: conservarla como excepción no modal permitiría accionar el
fondo con el teclado mientras sigue atenuado. Por eso comparte el mismo ámbito
de seguridad que las otras cinco, sin cambiar su geometría lateral.

La barra superior conserva arrastre y controles de ventana; el contenido y las
otras acciones quedan inertes mientras una capa está abierta. Los controles de
ventana siguen al contenido del popup en el ciclo de Tab. Escape cierra primero
la capa superior y devuelve el foco al origen. Los errores/toasts siguen fuera
del contenido inerte. Se conservan los guards de cierre ya existentes durante
la exportación ICS y el guardado del editor.

En GPUI, `native/hub/src/launcher/editor.rs` define Escape y ciclo de Tab en
`key()` y el ancho de 480 px en el render del cajón. El editor web conserva su
borrador mientras guarda y no envía un guardado al descartarlo con Escape.

## Verificación

El guard AST `tests/dialog-architecture.test.ts` ya no tiene una lista de
excepciones para Calendario. Todas estas capas pasan por el envoltorio común.

`scripts/check-calendar-dialog-safety.ts`, ejecutado desde `web-a11y.ts` en CI,
comprueba en Chromium real las seis capas: ciclo de foco, controles de ventana
accesibles, Escape y retirada de `inert`; Avisos añade el bloqueo de Ctrl L y
la restauración del foco. También comprueba el cajón de aplicaciones y su foco
de retorno. No usa jsdom como prueba de `inert`.

El contador incluye `launcher.favorite` y `launcher.launch`. Cada escena cierra
su capa y prueba Ctrl L en la pantalla normal como control positivo. El límite
del ciclo se comprueba desde el primer control: Mayús Tab lleva al último botón
de ventana y Tab devuelve al primero, sin suponer que veinte pulsaciones bastan
en un calendario ampliado. También se ejecutan Ampliar → Ficha → Escape y
Ficha → ICS → Cancelar, con sus padres inertes y foco en los orígenes reales.

El intercambio directo de Avisos/ICS desde el fondo se ha retirado: el ámbito
modal ya no permite accionarlo. El cajón de aplicaciones vuelve al buscador si
desaparece el origen y descarta su intención de reintento al cerrarse.
La política del zoom dentro de diálogos queda para la decisión de accesibilidad
de [#2183](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2183).

No cambia el contrato, el proceso principal, CSP, preload, canales de avisos ni
la vista previa que mantiene el worker D.
