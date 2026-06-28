# Changelog

Changelog publico para testers y Discord.

Solo se publican versiones funcionales confirmadas. Planes, reviews, analisis y cambios puramente documentales no requieren entrada propia salvo que se agrupen en una version funcional.

## v0.3.10.0

Primera beta abierta.

**Nuevo**

- Vantare queda consolidado como suite local con modulo `Ingeniero`, historial de mensajes y widget de notificaciones para overlays.
- Documentacion para testers: instrucciones de build, known issues, proceso de feedback y setup local de OBS.
- Hardening inicial de hotkeys globales en Windows con stubs seguros para otras plataformas.
- Autoupdater: descarga e instalacion verificada de nuevas versiones desde GitHub Releases.
- Pipeline de release automatizado: build, installer NSIS, portable zip y checksums SHA256 via `wails3 task release:artifacts`.
- GitHub Actions workflow para builds de release con gates de tests/lint (R03.C).
- Presets de widgets: guardar, aplicar y compartir configuraciones visuales (Widget Preset Gallery).

**Mejorado**

- La URL de OBS en Ajustes usa un perfil real activo o el fallback seguro `example-racing.json`.
- El widget Delta usa datos live reales para `Target` y `Lap`.
- El backend prioriza el `DeltaBest` nativo de LMU cuando llega desde Shared Memory.
- Release workflow idempotente: reruns sobre tags ya publicados ya no fallan.
- Workflows de Discord protegidos contra re-runs y tags fantasma (tag-guard + run_attempt).
- WidgetStudio: selector de escenario mock (Practica/Qualy/Carrera) para Standings.

**Corregido**

- Los deltas negativos ya no se descartan en la fusion de telemetria.
- `DeltaBest == 0` se trata como dato no disponible para no pisar un delta valido previo.
- Tests de delta usan helpers de fixtures en lugar de offsets hardcodeados.
- SmartScreen: documentado como comportamiento esperado (sin firma de codigo hasta release estable).
- NSIS installer: resuelto shim de wails3 que fallaba con 0x2 (`tools/build_nsis.ps1`).

**Para testers**

- Esta es la **primera beta abierta**. Consulta `docs/tester-build-instructions.md` para instalar.
- Los widgets Relative, Standings y Delta son **stable**. Pedals e Ingeniero son **tester**.
- No hay firma de codigo: SmartScreen mostrara advertencia. Verifica el checksum SHA256 de tu descarga.
- Probad Delta en LMU live: valores negativos deben mostrarse en verde al mejorar y positivos en rojo al perder tiempo.
- Probad la URL de OBS desde Ajustes y confirmad que carga el perfil correcto.
- Ingeniero esta disponible como modulo de prueba, pero el adaptador live LMU de Ingeniero sigue pendiente (EN6).
- Reportad bugs en `#beta-bug-reports` de Discord siguiendo la plantilla del protocolo de feedback.
- No se publica release por cada commit; solo versiones etiquetadas.

## v0.3.9.2

**Nuevo**

- Flujo inicial de changelog publico y publicacion automatica en Discord al crear tags `v*`.
- Documento de UX mock/live/demo para alpha testers.

**Mejorado**

- El indicador global de fuente de telemetria en la barra superior ahora incluye `title` y `aria-label`.
- Los tests del selector mock de `Standings` usan `aria-pressed` en lugar de clases visuales.

**Corregido**

- Menor riesgo de regresion visual en el selector `Práctica` / `Qualy` / `Carrera`.

**Para testers**

- Sin LMU abierto, comprobad que la fuente se entiende como `Mock` o fallback.
- En `Widgets` -> `Standings`, cambiad `Práctica` / `Qualy` / `Carrera` y confirmad que no activa `Guardar`.
- En una release taggeada, Discord deberia recibir automaticamente esta entrada del changelog.

## v0.3.9.1

**Nuevo**

- Los perfiles recomendados de Vantare pueden guardarse como copia propia editable.

**Mejorado**

- `Relative` y `Standings` redimensionan proporcionalmente en el editor de layout, overlay desktop y OBS.
- Los perfiles legacy con cajas deformadas se muestran con el aspecto correcto desde el primer render.
- La version visible de la app pasa a `v0.3.9.1`.

**Corregido**

- Guardar un recomendado como copia propia genera IDs unicos y convierte a schema v2.
- Guardar una copia recomendada ya no muta el perfil original.
- `Standings` ya no queda ligeramente recortado al redimensionar.

**Para testers**

- Probad `Mis perfiles` -> `Editar layout` con `Relative` y `Standings`.
- Probad resize horizontal, vertical y diagonal.
- Probad `Recomendados por Vantare` -> guardar como perfil propio.
- Reportad si algun overlay queda cortado, deformado o con espacio vacio raro.
