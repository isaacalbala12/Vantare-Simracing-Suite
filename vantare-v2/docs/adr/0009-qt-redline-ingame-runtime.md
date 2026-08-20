# ADR 0009: runtime ingame Qt Quick para Vantare Endurance Redline

## Estado

Accepted — 2026-08-20. Aprobado por Isaac y revisado en GitHub #691, hija de
#690. La aceptación autoriza P0/P1; no autoriza promoción a `nightly`.

## Contexto

ADR 0003 estableció `WidgetVisualHost` como la frontera compartida de los
renderizadores de Overlay Studio V3, Workshop, Desktop web y OBS. Esa decisión
sigue siendo correcta para autoría, preview y superficies web.

El spike ISA-370 indica que Qt Quick puede reducir de forma material el coste
del runtime ingame de la familia Vantare Endurance Redline. También mostró que
Standings es el caso difícil: su fidelidad temporal todavía no cabe de forma
demostrada en el presupuesto. La decisión necesita, por tanto, una evaluación
reversible antes de integrar Qt en producto.

El alcance de #690 son exclusivamente estos diseños oficiales Redline:

- Standings;
- Relative Mirror, Proximity y Traffic;
- Delta;
- Pedals.

Track Map, otros diseños Endurance y cualquier otro sistema visual quedan
fuera. La autoridad de datos futura es el contrato público `OverlayFrame v2`
de ADR 0008. La conexión a datos reales queda bloqueada hasta que GitHub #677
cierre la matriz requerida por esos widgets.

## Decisión

Se acepta evaluar un runtime ingame Qt Quick como sidecar Windows x64, con las
siguientes fronteras:

1. **La autoridad visual continúa en TSX/CSS.** Los renderizadores productivos
   de Vantare Endurance Redline y sus contratos de movimiento siguen siendo la
   referencia que se replica y contra la que se mide Qt. QML no crea un segundo
   sistema de autoría ni una nueva familia de diseños.
2. **La excepción ocurre antes de crear la ventana ingame.** Un selector en el
   proceso Go decide una sola vez si el perfil completo es elegible para Qt o
   si crea la ventana Wails existente. No existe selección por widget ni dos
   motores visibles en un mismo perfil.
3. **Qt no sustituye Studio, Workshop ni OBS.** Esos consumidores, el preview
   web y el fallback de Desktop mantienen `WidgetVisualHost`, de acuerdo con
   ADR 0003. La ruta Qt solo puede reemplazar la ventana ingame Desktop cuando
   el perfil completo cumple el contrato de elegibilidad.
4. **Wails es el valor por defecto y el fallback.** Qt comienza opt-in. Un
   perfil no elegible, edit mode, una capa global no soportada, un fallo de
   arranque o la terminación inesperada del sidecar vuelven a Wails sin
   convertir ni reescribir el documento del usuario.
5. **El sidecar consume solo `OverlayFrame v2`.** No importa structs internas
   de Telemetry Core ni el snapshot legacy. Go supervisa el proceso y envía
   mensajes JSON UTF-8 enmarcados por un pipe local, con versión, límites y
   cierre explícitos.
6. **La selección es por perfil completo.** Solo son elegibles perfiles cuyos
   widgets visibles pertenecen a la lista Redline soportada y cuyas funciones
   globales están cubiertas. Cualquier elemento desconocido cierra la ruta Qt.
7. **Standings es el gate fail-fast.** Antes de tocar selección o supervisión
   de producto, el candidate portable debe reproducir el corpus custodiado y
   Standings debe superar el presupuesto temporal y visual acordado. Un STOP
   es un resultado válido: si exige arquitectura especial, #690 no integra Qt.

## Consecuencias

### Positivas

- La evaluación no cambia perfiles ni compromete Studio, Workshop u OBS.
- El ahorro potencial se mide sobre un candidate aislado antes de introducir
  lifecycle o packaging en producto.
- La frontera pública de telemetría evita acoplar el renderer al rediseño del
  Telemetry Core que está en curso.
- Wails conserva una ruta completa, conocida y recuperable durante Nightly y
  Testers.

### Costes y riesgos

- Durante la evaluación existirán dos implementaciones de runtime para la
  misma familia visual, aunque solo TSX/CSS sea autoridad y solo un motor se
  ejecute por perfil.
- QML debe seguir cambios futuros del diseño Redline mediante contratos y
  comparaciones explícitas.
- El sidecar añade empaquetado, supervisión y diagnóstico Windows que solo se
  justifican después del GO de Standings.
- Qt no se conectará a telemetría productiva hasta que #677 entregue el
  contrato público completo; antes de eso solo usa replay custodiado.

## Alternativas rechazadas

- **Sustituir `WidgetVisualHost` en todas las superficies:** rompería ADR 0003
  y mezclaría una optimización ingame con autoría, Workshop y OBS.
- **Elegir motor por widget o abrir dos ventanas:** aumenta composición,
  input, foco, orden Z y recuperación sin demostrar valor adicional.
- **Generar QML desde TSX/CSS o crear una DSL visual:** añade un compilador y
  una segunda plataforma de autoría fuera del problema evaluado.
- **Usar cgo o incrustar Qt en el proceso Go:** amplía la frontera de fallo y
  distribución; un sidecar es más aislable y reversible.
- **Shared memory o protocolo binario inicial:** no hacen falta para demostrar
  el presupuesto y elevan complejidad. El primer contrato es JSON enmarcado y
  acotado.
- **Retirar Wails durante #690:** elimina el rollback antes de disponer de
  evidencia Nightly/Testers.
- **Consumir structs internas o el snapshot legacy:** acoplaría el renderer a
  una implementación que está cambiando y duplicaría autoridad semántica.

## Rollback

La ruta Qt permanece detrás de una selección opt-in y no modifica documentos.
El rollback operativo consiste en desactivar la elegibilidad Qt y crear la
ventana Wails existente. El rollback de código elimina selector, supervisor,
sidecar y assets Qt sin cambios en Studio, Workshop, OBS, perfiles o contratos
TSX/CSS.

Si el gate P1 de Standings termina en STOP, el candidate y su evidencia quedan
como benchmark reproducible; no se crean las tareas P2 de integración.

## Relación con otras decisiones

- **ADR 0003:** se conserva. `WidgetVisualHost` sigue siendo la frontera web
  compartida; ADR 0009 solo autoriza una excepción previa a la ventana ingame.
- **ADR 0008:** aporta la única proyección pública que podrá consumir Qt.
- **GitHub #677:** bloquea el wiring de datos Redline reales.
- **GitHub #690:** contiene SPEC, PLAN y TASKS de la migración gradual.
- **GitHub #691:** revisa y acepta esta decisión.
