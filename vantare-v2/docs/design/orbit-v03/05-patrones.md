# 05 · Patrones de interacción

## 5.1 Navegación
- **Destino** = rail. **Contexto** = columna. **Trabajo** = workspace. **Detalle** = dock derecho.
- Cambiar de sección: cambia vista, contexto (`ctx-panel`), título de columna (`CONTEXT_TITLES`), topbar (`.topbar-ctx`) y `aria-current=page` en el rail. Persistir última vista y plegados (`vantare.v03orbit.*`).
- **Paleta de comando** (Ctrl K / botón del rail / superficie de comando): "Ir a" (todas las secciones + Cuenta) y "Acciones" (abrir/detener overlay, guardar perfil). Filtrado en vivo, ↑↓ ↵ Esc, ítems bloqueados con motivo.
- Entrada directa: cada sección abre en su estado útil (última estrategia, perfil activo, próximas salidas, sección Cuenta/Aplicación según origen).

## 5.2 Gating por plan y canal
- Mapa `ACCESS[plan][view]` (free · overlays · engineer · suite) + `REQUIRED_PLAN`. Telemetría es "próximamente" (no bloqueo de plan). Testing Center solo con canal testers/nightly.
- Bloqueado ⇒ `aria-disabled=true`, clase `locked`, candado (`i-lock`) y tooltip/toast con **motivo y plan requerido**; nunca desaparece del rail. La focal cambia su CTA a "Requiere Overlays"; los ítems de la paleta muestran "Requiere <plan>".
- Recordatorios de calendario deshabilitados en Free con título explicativo.

## 5.3 Honestidad de datos y estados
- Origen visible: `fixture-note`, `capability` (manual/observed), "Datos sintéticos", "horario de muestra", "próximamente".
- Estados operativos con una sola fuente y ecos por color: sim (`connected/searching/disconnected` → pill del pie, punto del saludo, seg Mock/Live), overlay (`stopped/running` → botón del topbar, meta de la focal, estado del bloque de perfil), guardado (`saved/dirty`), actualización (`none/available/downloading/ready`).
- Estados vacíos: título + causa + acción (Estrategia sin planes, Ingeniero sin mensajes, Telemetría sin sesiones); no se pintan gráficos vacíos.
- Modo estrés (`?stress=1`): 20 widgets, nombres largos, notas multilínea → todo debe truncar con elipsis o envolver sin romper alturas.

## 5.4 Selección y detalle
- Listas con `role=listbox/option` o botones con `aria-selected`; una selección → panel de detalle a la derecha (serie en Carreras, widget en Studio, stint en Estrategia).
- Sincronía cruzada: seleccionar en lista ≡ seleccionar en lienzo/mapa/timeline (Studio widget↔lienzo, Carreras fila↔bloque, Estrategia tarjeta↔bloque, Telemetría insight↔tramo del mapa↔cursor de trazas).

## 5.5 Edición in-place
- Inspector del Studio: acordeones con resumen; cambios reflejados al instante en el resumen y en el lienzo.
- Estrategia: cambiar piloto en la tarjeta recalcula el plan (horas, ventana de boxes, donut, timeline); lápiz despliega el editor (vueltas/combustible manuales, "Volver a automático"); todo cambio pone el estado en **Borrador**; **Restablecer** vuelve al plan original.
- Historial: deshacer/rehacer con Ctrl Z / Y donde hay edición (Studio, Estrategia).

## 5.6 Arrastrar y soltar (con alternativas)
- Fuente `draggable=true` (neumáticos, futuro: reordenar stints/widgets); destino con `dragover` (resalte coral + halo), `drop` (pulso verde), `dragleave`.
- **Siempre** dos alternativas: *tocar y tocar* (seleccionar fuente → `.picked`, tocar destino) y **teclado** (Enter/Espacio en el destino con una fuente elegida). Quitar con ×.
- Feedback textual: toast al elegir sin destino abierto ("Abre un stint y toca la esquina").

## 5.7 Tiempo y cadencia
- Horas locales calculadas desde reglas (intervalo/offset o slots UTC) con `Intl`; zona horaria mostrada junto al reloj.
- Cuentas atrás "en mm:ss" que se actualizan cada segundo; el dial del hero se sincroniza; listas se refrescan cada 30 s.
- Timelines: eje visible siempre; línea "ahora"; bloques con ancho = duración (mín. cadencia − 3 min para no solapar).

## 5.8 Comparación
- Variantes A/B con la misma base; comparación en tarjetas paralelas con métricas coloreadas mejor/peor y un **veredicto en una frase** que explica el porqué (vueltas completadas, paradas ahorradas, coste de ritmo).

## 5.9 Confirmaciones y destructivo
- Sin `confirm()` nativo. Acciones destructivas (eliminar widget, cerrar sesión remota) con botón `danger` y confirmación propia (toast/diálogo). Cambios reversibles no piden confirmación.

## 5.10 Persistencia local
localStorage con prefijo `vantare.v03orbit.` (vista, columna plegada, dock, densidad). Envuelto en `store.get/set` tolerante (data:, sandbox, privado).

## 5.11 Ayuda contextual
Tooltips propios en el rail; `title` en bloques del timeline y esquinas; notas ámbar para limitaciones de la fuente ("el dorsal no llega en carrera").
