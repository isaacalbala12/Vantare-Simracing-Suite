# Master Feature Plan

Plan maestro de features de Vantare Suite, con Overlays Studio e Ingeniero como modulos internos.

> Actualizacion 2026-06-29: este documento queda como mapa de producto y contexto historico. La linea publica se reinicio en `v0.1.x`; el estado operativo inmediato vive en `docs/current-plan.md` y la fuente de ejecucion hacia release oficial sigue siendo `docs/release-roadmap-execution-index.md`.
>
> Si hay conflicto, prevalecen: decisiones explicitas del chat, `docs/release-roadmap-execution-index.md`, planes `release-*`, y despues este documento.

Este documento ayuda a entender el producto completo, pero no debe usarse para saltarse el indice de release.

## Fuentes

- `docs/alpha-beta-roadmap.md`
- `docs/beta-widget-system-spec.md`
- `docs/product-widget-customization.md`
- `docs/current-plan.md`
- `docs/vantare-suite-architecture.md`
- `docs/superpowers/plans/2026-06-25-vantare-suite-ingeniero-integration.md`
- `docs/engineer-live-lmu-adapter-analysis.md`
- `C:\Users\isaac\Desktop\trabajo\Proyectos\Overlays\Desarollo\Roadmap - Vantare Overlays.md`
- `C:\Users\isaac\Desktop\trabajo\Proyectos\Overlays\Desarollo\Roadmap Dia a Dia - Vantare Overlays.md`
- `C:\Users\isaac\Desktop\trabajo\Proyectos\Overlays\Desarollo\Features por desarrollar.md`

## Versionado

El versionado operativo usa formato `X.X.X.X`, por ejemplo `0.1.2.0`.

Referencia actual:

- `0.1.0.X`: beta publica inicial y hotfixes criticos. El cuarto segmento es hotfix (`0.1.0.1`, `0.1.0.2`).
- `0.1.x`: backlog activo tras cerrar hotfixes: Hub v5.2 en cortes incrementales, Linux/Proton experimental, Vantare Setup Launcher, LMU race countdown, launcher de simuladores, overlays, disenos oficiales, hardening y rendimiento.
- `0.2.X.X` a `0.9.X.X`: fases de beta/release posteriores segun avance real, no una promesa rigida.
- `1.0.0.0`: release estable.

Historico:

- Las builds `v0.3.*` fueron builds internas/alpha y no deben anunciarse publicamente tras el reset a `v0.1.x`.

La politica completa vive en `docs/versioning-and-release-gates.md`.

## Reglas de ejecucion

- Antes de crear un miniplan tecnico, leer este documento.
- Consultar primero `docs/release-roadmap-execution-index.md` para saber el orden oficial de release.
- Consultar `docs/roadmap-execution-board.md` solo como tablero historico/operativo auxiliar.
- Trabajar la primera release planificada salvo decision explicita.
- No iniciar multisimulador sin inventario, matriz de datos y adapter contract; Assetto Corsa e iRacing son scope de release, no futuribles.
- No ampliar configuracion profunda de otros widgets antes de cerrar producto usable.
- No ejecutar mas reworks visuales completos hasta cerrar la mayoria de features core; los proximos cambios visuales deben ser polish acotado o fixes.
- Vantare debe tratarse como suite local. Overlays Studio e Ingeniero son modulos internos del mismo producto, no apps separadas en runtime.
- Ingeniero no sustituye el roadmap de Overlays. Si no puede probarse live, se aparca EN6 y se sigue desarrollando Overlays.
- Linux/Proton queda por planear en la serie `0.1.x` como experimental. No prometer soporte estable hasta validar ejecucion, overlay transparente/click-through y telemetria LMU.
- El instalador propio queda por planear en `0.1.x` como **Vantare Setup Launcher v1**: UI propia que verifica SHA256 y lanza NSIS por debajo. No reemplaza NSIS completo inicialmente.
- El launcher de simuladores queda por planear en `0.1.x`: primer corte LMU-only, abrir simulador desde Vantare y agrupar acciones asociadas por simulador.
- Cualquier prompt de worker que toque Go debe exigir las skills `golang-error-handling`, `golang-testing` y `golang-code-style`; si toca lifecycle, goroutines, SSE o cancelacion, tambien `golang-concurrency` y `golang-context`; si toca I/O/config/seguridad, tambien `golang-safety`.
- Cada feature grande debe pasar por inventario, miniplan, implementacion, review y verificacion manual.
- El agente principal debe actuar como orquestador/reviewer por defecto y delegar codigo a workers salvo necesidad estricta.
- Mantener la separacion:
  - `WidgetStudio`: apariencia, datos, columnas, filtros, formatos y comportamiento interno.
  - `LayoutStudio`: posicion, tamano y colocacion.

## Estados

- `Done`: implementado y validado.
- `In progress`: parcialmente implementado o pendiente de verificacion.
- `Next`: siguiente feature recomendada.
- `Planned`: aprobada para la fase, aun no iniciada.
- `Later`: fuera de la fase actual.
- `Blocked`: necesita decision, dato externo o arquitectura previa.

## Objetivo de producto por fase

### Alpha privada

Usuarios:

- usuario principal;
- testers cercanos.

Objetivo:

Validar que Vantare Suite ya es un producto local usable para LMU, empezando por Overlays Studio como flujo principal.

Debe cerrar:

- producto usable de extremo a extremo;
- `LayoutStudio` funcional para mover/redimensionar;
- rework visual/UX de `Overlays Studio` usando el HTML de referencia como inspiracion de diseno, no como arquitectura;
- `Relative` con capa completa de personalizacion;
- `Standings` con capa completa de personalizacion excepto multiclase;
- perfiles locales robustos;
- recomendados como punto de partida;
- mock/live/demo entendible;
- overlay desktop funcional;
- seccion Ingeniero visible y funcional en modo simulator/replay;
- widget de notificaciones de Ingeniero registrado en desktop/OBS/previews;
- separacion clara `WidgetStudio`/`LayoutStudio`;
- checklist manual de alpha.

No bloquea alpha privada:

- OBS;
- delta best live;
- hotkeys;
- `Pedals`;
- pagos;
- cuentas;
- multisimulador.
- Ingeniero live LMU real si no puede probarse con datos live.
- audio/TTS real de Ingeniero.

### Beta privada de testers

Usuarios:

- testers externos concretos.

Objetivo:

Recibir feedback real de pilotos/streamers sin abrir pago publico.

Debe cerrar:

- todo lo de alpha privada;
- build compartible;
- instrucciones breves para testers;
- canal de bugs/feedback;
- OBS setup local sencillo;
- delta best live fiable;
- hotkeys basicas;
- `Pedals` beta v1 con diseno pequeno nuevo;
- perfiles recomendados iniciales bien elegidos;
- known issues claros.

No entra todavia:

- doble PC por LAN como requisito;
- companion app;
- pagos;
- cuentas;
- multisimulador estable;
- comunidad/marketplace.

### Beta publica de pago

Usuarios:

- usuarios externos de pago en beta abierta.

Objetivo:

Validar monetizacion y soporte con un producto LMU-first vendible.

Debe cerrar:

- todo lo de beta privada;
- Stripe directo;
- Supabase auth;
- licencia online obligatoria con gracia de 24h y 1 PC activo;
- instalador o distribucion clara;
- actualizaciones/versionado claro;
- perfiles recomendados de calidad;
- `Relative`, `Standings` y `Pedals` estables;
- layouts por sesion si estan solidos;
- OBS y overlay desktop robustos;
- documentacion publica minima;
- soporte/feedback organizado.

Puede entrar si esta listo:

- data blocks simples;
- OBS por LAN para doble PC;
- primeras mejoras de pago/licencia.

No debe prometer:

- cloud sync completo;
- companion app;
- community layouts;
- marketplace;
- telemetry uploads/replays de usuarios.

Estado 2026-06-29:

- `v0.1.0.0` ya fue publicada como primera beta publica.
- `v0.1.0.1` queda como hotfix P0 para corregir variables Supabase en build de release.
- La galeria de disenos oficiales, login obligatorio y perfiles publicos quedan dentro de la beta.
- Linux/Proton, Vantare Setup Launcher, LMU race countdown y launcher de simuladores quedan registrados como `0.1.x por planear`, no como implementacion inmediata.

### Release

Usuarios:

- publico general del producto estable.

Objetivo:

Version estable que puede sostener reputacion, soporte y ventas.

Debe cerrar:

- LMU muy solido;
- beta publica estabilizada;
- instalacion/update fiable;
- performance validada;
- regresion visual minima cubierta;
- errores criticos cerrados;
- documentacion de usuario;
- soporte organizado.

Post-release:

- community layouts;
- sync cloud completo de layouts/perfiles;
- companion app para PC de streaming;
- plugin system publico.

## Roadmap versionado

Las fases versionadas siguientes son historial operativo previo al reset publico. Para la linea publica actual, usar primero el bloque `Roadmap publico 0.1.x` de este documento y `docs/current-plan.md`. Para el release oficial, ejecutar `docs/release-roadmap-execution-index.md`.

### Roadmap publico 0.1.x

| Version objetivo | Estado | Alcance |
|------------------|--------|---------|
| `0.1.0.0` | Publicada | Primera beta publica: login obligatorio, gating free/paid/suite, perfiles recomendados, galeria de disenos oficiales, overlay edit mode, updater verificado. |
| `0.1.0.x` | Activo | Hotfixes criticos de login, Supabase frontend/backend, licencias, updater, overlay fullscreen, crashes, release pipeline o bloqueos de uso. |
| `0.1.x` | Por planear | Linux/Proton experimental: build Linux, ejecucion de `vantare.exe` via Proton y viabilidad de telemetria LMU. |
| `0.1.x` | Por planear | Vantare Setup Launcher v1: UI propia de instalacion, verificacion SHA256, lanzamiento de NSIS y enlace a portable/known issues. |
| `0.1.x` | Por planear | LMU race countdown beta: import manual/asistido por IA del calendario semanal publicado en Discord y notificacion overlay sobre el simulador con avisos de tiempo restante. |
| `0.1.x` | Por planear | Launcher de simuladores: primer corte LMU-only para abrir simulador desde Vantare y agrupar acciones asociadas. |
| `0.1.x` | En progreso | Hub v5.2: primer corte implementado (shell, Dashboard y Launcher). Faltan paginas internas/subpestanas, cableado final y review antes de tratarlo como cerrado. |
| `0.1.x` | Por planear | Nuevos overlays publicos, disenos oficiales adicionales, hardening de licencias y primeras correcciones de rendimiento. |

Regla: salvo hotfixes `0.1.0.x`, todo este bloque queda por planear. No anunciar Linux como estable, instalador propio completo, countdown ni launcher de simuladores hasta cerrar miniplan, implementacion, review y smoke real.

Regla para calendario LMU: no implementar scraping automatico de Discord en la beta inicial. El flujo publico aceptado para `0.1.3.0` es import manual/asistido por IA, validacion local y avisos overlay. La automatizacion directa de Discord queda para una iteracion posterior si es viable.

### 0.1.X.X - Pre-alpha/foundation

Estado: `Done`.

Objetivo:

Base tecnica, Overlays Studio inicial y primer widget configurable.

Ya conseguido:

- app local Go/Wails + React;
- Hub;
- Overlays Studio;
- schema v2 base;
- variantes de widgets;
- `WidgetStudio`;
- `LayoutStudio`;
- preview aislada estable;
- `Relative` configurable con columnas, formatos y filtros;
- overlay desktop funcional;
- controles live restaurados en flujos permitidos.

Resultado:

- foundation tecnica cerrada para continuar con features de alpha;
- preview aislada estabilizada;
- primer corte de `Standings` decidido e implementado en 0.3.

### 0.2.X.X - Alpha privada: producto usable

Estado: `Next`.

Objetivo:

Cerrar el producto base usable antes de seguir ampliando widgets.

Features:

1. Verificacion de separacion `WidgetStudio`/`LayoutStudio`.
2. `LayoutStudio` drag & drop y resize funcionales si no estan completos.
3. Guardado/carga robustos tras mover/redimensionar.
4. Recomendado -> copia editable.
5. Mock/live/demo entendible en Hub/editor.
6. Checklist alpha privada.

Gate de salida:

- un tester cercano puede abrir la app, mover widgets, guardar, cerrar, reabrir y abrir overlay desktop sin asistencia tecnica.

### 0.3.X.X - Alpha privada: UI y widgets core

Estado: `In progress`.

Objetivo:

Cerrar la experiencia de `Overlays Studio` y los dos widgets core.

Features:

1. Rework visual/UX acotado de `WidgetStudio`.
   - Fuente visual: HTML de referencia del usuario.
   - Ruta de referencia actual: `C:\Users\isaac\Desktop\Vantare-Overlays\overlays_mockup.html`.
   - Alcance cerrado en `v0.3.9.0`: editor de widgets, densidad, jerarquia, panel derecho y controles de `Relative`/`Standings`.
   - No cambiar responsabilidades ni arquitectura sin plan separado.
2. `Relative` cierre final.
   - Toda la personalizacion definida para `Relative`.
   - No expandir mas alla del contrato ya aprobado salvo bug.
3. `Standings` configurable completo excepto multiclase.
   - Todas las features aplicables del documento original.
   - Columnas.
   - Filtros no multiclase.
   - Formatos.
   - Colores.
   - Anchos/alineacion cuando aplique.
   - Guardado real.
   - Preview correcta.
4. Verificacion manual de alpha privada.

Ya conseguido:

- `Standings` configurable excepto multiclase.
- Escenarios mock practica/qualy/carrera para preview.
- Guardado explicito en `WidgetStudio`.
- UI2 visual rework de `WidgetStudio`.
- PREVIEW2 intrinsic width de `Relative` y `Standings`.

Decision actual:

- No hacer mas reworks visuales completos hasta cerrar la mayoria de features core.
- Continuar con A2/A3 (`LayoutStudio` drag/resize/save) para cerrar producto usable.

Gate de salida:

- `Relative` y `Standings` son configurables de forma suficiente para perfiles reales LMU.
- La UI ya no se siente como prototipo tecnico.

### 0.4.X.X - Beta privada testers: distribucion y uso real

Estado: `Planned`.

Objetivo:

Dar la app a testers externos concretos.

Features:

1. Build compartible.
2. Instrucciones de instalacion.
3. Known issues.
4. Canal de feedback/bugs.
5. Perfiles recomendados iniciales.
6. OBS setup local sencillo.
   - URL visible.
   - Boton copiar.
   - Instrucciones compactas.
   - No incluye doble PC/LAN como requisito.
7. Hotkeys basicas.
8. Delta best live fiable.

Gate de salida:

- tester externo puede instalar, abrir overlay, usar recomendado, editar basico y reportar bugs.

### 0.5.X.X - Beta privada testers: completar core LMU

Estado: `Planned`.

Objetivo:

Cerrar beta privada antes de abrir pago.

Features:

1. `Pedals` beta v1.
   - throttle;
   - brake;
   - clutch;
   - diseno nuevo mas pequeno;
   - labels si encajan;
   - valores numericos si encajan;
   - colores/opacidad basicos.
2. Recomendados pulidos.
3. `Widget Preset Gallery` (Galería de presets de widgets).
   - Permitir guardar configuraciones de apariencia/comportamiento interno de un widget desde `WidgetStudio` como un preset reutilizable (columnas, filtros, formatos, colores, alineaciones, anchos).
   - Permitir seleccionar y aplicar presets compatibles en cualquier perfil para widgets del mismo tipo.
   - Contrato estricto de separación: el preset solo altera la configuración interna del widget. Nunca guarda ni altera posición (`position.x/y`), tamaño (`position.w/h`), estado habilitado (`enabled`), telemetría o estado en runtime.
4. UX final de tester.
5. Smoke test completo.
6. Preparacion de beta publica de pago.

Gate de salida:

- LMU tiene un set de widgets core usable: `Relative`, `Standings`, `Pedals`, y flujo de overlay estable.
- Los beta testers pueden guardar y reutilizar presets de widgets core de manera consistente sin alterar la disposición en pantalla (layout).

### 0.6.X.X - Beta publica de pago: acceso y pago

Estado: `Later`.

Objetivo:

Abrir beta de pago sin construir aun un sistema completo de cuentas/comunidad.

Features:

1. Stripe directo.
2. Supabase auth.
3. Licencia online con gracia de 24h y 1 PC activo.
4. Pagina/instrucciones de descarga.
5. Versionado visible.
6. Changelog minimo.
7. Soporte/feedback organizado.

Gate de salida:

- usuario puede pagar, descargar/acceder y usar Vantare sin coordinacion manual pesada.

### 0.7.X.X - Beta publica de pago: polish y layouts

Estado: `Later`.

Objetivo:

Convertir beta de pago en producto mas completo.

Features:

1. Layouts por sesion manuales.
2. Fallback a `general`.
3. Auto-switch por sesion solo si lo manual esta estable.
4. Temas/densidad/opacidad mas maduros.
5. Mejoras de recomendados.
6. Mas checklists de regresion.

Gate de salida:

- el usuario puede adaptar su overlay a distintos contextos de sesion sin romper perfiles.

### 0.8.X.X - Beta publica de pago: data blocks y OBS avanzado

Estado: `Later`.

Objetivo:

Ampliar valor sin romper LMU-first.

Features candidatas:

1. Fuel/energy saver widget.
2. Tire wear si el dato es fiable.
3. Stint timer.
4. Damage setting si hay dato fiable.
5. Onboard setting si hay dato fiable.
6. OBS por LAN/doble PC como feature futura posible.

No entra:

- companion app completa;
- multisimulador estable;
- marketplace.

Gate de salida:

- los data blocks incluidos usan datos fiables o quedan marcados como experimentales/tester.

### 0.9.X.X - Beta publica de pago: release candidate

Estado: `Later`.

Objetivo:

Preparar `1.0.0.0`.

Features:

1. Hardening.
2. Performance.
3. Instalacion/update.
4. Documentacion usuario.
5. Regression suite.
6. Limpieza de bugs criticos.
7. Revision de pricing/acceso.

Gate de salida:

- el producto puede pasar a release estable sin cambiar la promesa principal.

### 1.0.0.0 - Release estable

Estado: `Later`.

Objetivo:

Vantare Overlays para LMU estable.

Incluye:

- LMU-first completo;
- widgets core estables;
- perfiles/recomendados;
- OBS/desktop robustos;
- pago/acceso estable;
- docs;
- soporte;
- performance validada.

## Feature order actual

Orden operativo desde hoy:

1. `A2`: inventario `LayoutStudio` drag/resize/save.
2. `A3`: implementar/fijar `LayoutStudio` si A2 detecta huecos.
3. `A4`: recomendado -> copia editable: inventario.
4. `A5`: recomendado -> copia editable: implementacion/fixes.
5. `A6`: mock/live/demo UX: inventario.
6. `A7`: mock/live/demo UX: implementacion/fixes.
7. `A8`: checklist alpha privada.
8. `B1`: build testers.
9. `B2`: OBS setup local.
10. `B3`: hotkeys.
11. `B4`: delta best live.
12. `B5`: `Pedals` beta v1.

El estado operativo detallado vive en `docs/roadmap-execution-board.md`.

## Antipatrones

- Implementar multisimulador sin matriz de datos, adapter contract y fixtures por simulador.
- Implementar pagos/licencias sin Stripe directo, Supabase, periodo de gracia y revocation flow documentados.
- Meter comunidad antes de pago/release.
- Expandir widgets no core antes de cerrar producto usable.
- Resolver doble PC antes de beta publica salvo necesidad comercial.
- Usar `WidgetStudio` para X/Y/W/H.
- Usar `LayoutStudio` para columnas/metricas.
- Crear un editor libre tipo Figma.
- Implementar todo `Standings` en un solo prompt.
- Dar planes multi-feature a modelos pequenos.
- Introducir metricas no confirmadas como `stable`.

## Futuribles registrados

- Companion app para PC de streaming.
- Community Layouts.
- Sync cloud completo.
- Plugin system.

Ya no son futuribles: Stripe/Supabase/licencias, autoupdater, iRacing, Assetto Corsa como simulador, Assetto Corsa Lua/CSP pack, Track Map, Input Telemetry/Trace, calendario LMU por Discord, My Account minimo y OBS LAN/doble PC. Esos puntos estan dentro del release scope y viven en `docs/release-roadmap-execution-index.md`.
