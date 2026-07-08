# Changelog

Changelog publico para testers y Discord. Solo se publican versiones funcionales confirmadas. Planes, reviews, analisis y cambios puramente documentales no requieren entrada propia salvo que se agrupen en una version funcional.

## v0.1.0.4

Hotfix critico: el backend no emitia `hub:profiles` despues de `hub:create`, `hub:save-own-copy` o `hub:delete`, por lo que la lista de perfiles propios nunca se actualizaba en la UI aunque los perfiles se creasen correctamente en disco.

**Corregido**

- El backend ahora emite `hub:profiles` (lista completa) tras crear, copiar o eliminar un perfil, ademas de los eventos `hub:profile-created` / `hub:profile-deleted` que ya existian. El frontend escucha `hub:profiles` y refresca la lista automaticamente.
- Resuelve el bug visual de "Nuevo perfil" en Overlays Studio -> Mis perfiles: el prompt aceptaba el nombre, el perfil se guardaba en disco, pero la UI no lo mostraba hasta recargar.

**Para testers**

- Si tienes un perfil que creaste en `v0.1.0.3` y no aparecia en la lista, ya deberia verse al abrir esta build.

## v0.1.0.3

Patch de beta con microcortes cerrados: fixes de launcher post-fase-6, refactor de calendar con series de intervalo en DayView, roadmap dual con feedback panel, locales completos (es, en, pt, it) y traduccion de auth/paywall, dashboard polish, integracion de supabase auth y stripe webhook, y Widget Studio accesible sin perfil propio.

**Nuevo**

- **Calendar**: DayView, MonthView y WeekView reescritos con soporte de series de intervalo (Bronce/Plata/Oro) y helpers compartidos.
- **Roadmap**: doble roadmap con panel de feedback y changelog real, incluyendo datos i18n.
- **i18n**: soporte completo de 4 locales (es, en, pt, it) con provider global y fallback.
- **i18n-03b**: traduccion de LoginScreen, PaywallScreen, LicenseBanner y UnconfiguredScreen.
- **Widget Studio accesible sin perfil propio (WS-10)**: editor Crystal ahora abre con `EMPTY_PROFILE` sintetico; boton Guardar y selector de diseno quedan deshabilitados con copy honesto hasta que el usuario cree o active un perfil real.
- **Hub dashboard polish**: carousel de features, account settings, license provider y cliente Supabase.
- **Stripe webhook**: integracion de checkout y portal en supabase functions.
- **Admin CLI**: nuevo binario `vantare-admin` con tests.
- **Roadmap features from plans**: lectura automatica de features desde planes con `scripts/generate-roadmap-progress.mjs`.

**Mejorado**

- **Launcher post-fase-6 fixes**: orchestrator, profiles y dock integrados con eventos Wails.
- **Calendar refactor**: eliminados componentes legacy (CalendarSeriesCard, calendar-tier) consolidados en `calendar-shared.ts`.
- **Build config**: `build/config.yml` y `build/windows/info.json` sincronizados con VERSION via `task version:sync`.
- **Changelog**: entrada `v0.1.0.3` con detalle de microcortes cerrados.

**Corregido**

- **Configuracion incompleta en smoke local**: mejor separacion entre binarios stale y reales.

**Para testers**

- Esta es la build que consolida los microcortes cerrados durante la fase beta. Si encuentras regresiones, reportalas en `#beta-bug-reports`.
- El plan `v0.1.0.x` se mantiene en fase beta publica de pago (`0.6.X.X` en el sistema de gates).
- No publiques tags `v0.3.*` ni `v0.1.0-alpha.*` en Discord: son rastro interno, no builds publicas.

## v0.1.0.2

Hotfix de beta para completar el flujo de login con Google OAuth externo y evitar bloqueos falsos de licencia Free.

**Corregido**

- Google OAuth abre el navegador externo del sistema y vuelve a la app mediante el callback local.
- El backend de licencias ya recibe la configuracion publica de Supabase en la build publicada.
- Los usuarios autenticados sin suscripcion entran como plan `free` en lugar de quedar bloqueados en Paywall.
- La pantalla `Configuracion incompleta` queda reservada para builds realmente mal configuradas.
- Se corrigio la confusion de smoke local causada por binarios antiguos/stale.

**Para testers**

- Descarga siempre los assets publicados en GitHub Release o desde `#beta-downloads`.
- Si haces smoke local, usa el portable/installer publicado o `bin/vantare.exe` generado por el pipeline de release; no uses binarios antiguos de la raiz del repo.
- Si ves `Configuracion incompleta`, reporta version exacta, ruta del `.exe` ejecutado y captura del mensaje.

## v0.1.0.0

Primera **beta publica** abierta de Vantare Suite.

Esta build consolida el conjunto de features estables probadas durante la fase alpha privada y abre el acceso a testers externos. Incluye login obligatorio, gating basico de licencia free / pago / suite, y un sistema de distribucion verificado con autoupdater.

**Nuevo**

- **Acceso con cuenta obligatoria**: login con Google OAuth como minimo. Sin cuenta no se puede usar la app para nada que no sea la propia pantalla de inicio de sesion.
- **Licencias online con gracia offline**: estado `active` mientras la validacion online funciona, estado `grace` durante 24 horas si el servidor no responde, `expired` al agotarse. Cache local cifrado con DPAPI en Windows.
- **Gating basico por plan**:
  - `free`: acceso limitado (vista previa de widgets y mock data).
  - `paid`: acceso completo a Overlays Studio con LMU live.
  - `suite`: Overlays Studio + Ingeniero + presets.
- **Overlays Studio** completo: editor de widgets (Relative, Standings, Pedals, Delta, Ingeniero), perfiles recomendados (`Clean Overlay`, `Le Mans Ultimate - Basic`), layout con drag/resize, preview aislada con ancho intrinseco.
- **Ingeniero**: modulo integrado con historial, notificaciones y widget de overlay. Funciona en modo simulacion/replay; el adaptador live LMU queda pendiente para una fase posterior.
- **Telemetria live de Le Mans Ultimate**: fuente compartida live/mock/demo con fallback automatico a datos sinteticos si LMU no esta abierto.
- **Widget Delta**: usa el `DeltaBest` nativo de LMU cuando esta disponible, con `Target` y `Lap`. Valores negativos en verde, positivos en rojo.
- **Hotkeys globales de Windows**: `Ctrl+Shift+V` (toggle overlay), `Ctrl+Shift+E` (modo edicion in-place), `Ctrl+Shift+Flecha izquierda/derecha` (cambiar perfil activo). Personalizables desde Ajustes.
- **Autoupdater**: descarga e instalacion verificada contra el sidecar `*.sha256` desde GitHub Releases. Si la release no incluye checksum, el updater rechaza la instalacion desde la app y deriva a descarga manual.
- **OBS local**: servidor interno en `http://127.0.0.1:39261/overlay?profile=...` con soporte SSE para telemetria e Ingeniero.
- **Presets de widgets**: guardar, aplicar y compartir configuraciones visuales sin tocar posicion ni tamano.
- **Galeria de disenos oficiales de widgets** (Widget Design Gallery): catalogo de disenos oficiales incluidos por Vantare para los widgets `Relative`, `Standings`, `Delta` y `Pedals`. Cada diseno aplica apariencia y variante sin tocar `position` ni `tamano`. Vive en WidgetStudio dentro del panel de ajustes del widget seleccionado. Solo lectura: los presets oficiales no crean ni comparten archivos; los presets de usuario siguen funcionando como antes.
- **Instalador NSIS y portable zip**: ambos con checksums SHA256 sidecar y verificacion automatica antes de publicar.

**Mejorado**

- Consolidacion de la suite local: Vantare ya no se describe solo como app de overlays, sino como suite con modulos `Overlays Studio`, `Ingeniero`, `Telemetria` y `Setup`.
- El backend prioriza el `DeltaBest` nativo de LMU cuando llega desde Shared Memory, en lugar de calcularlo a mano.
- Los deltas negativos ya no se descartan en la fusion de telemetria.
- `DeltaBest == 0` se trata como dato no disponible para no pisar un delta valido previo.
- Release workflow idempotente: reruns sobre tags ya publicados no fallan.
- WidgetStudio: selector de escenario mock (Practica/Qualy/Carrera) para Standings.
- URL de OBS en Ajustes usa un perfil real activo o el fallback seguro `example-racing.json`.

**Corregido**

- NSIS installer: resuelto shim de wails3 que fallaba con 0x2 (`tools/build_nsis.ps1`).
- Tests de delta usan helpers de fixtures en lugar de offsets hardcodeados.

**Aviso de SmartScreen (importante, leer antes de instalar)**

Los ejecutables de esta beta **no tienen firma digital Authenticode**. Windows SmartScreen mostrara una advertencia de "Editor desconocido" al ejecutar el instalador o el portable. Es un comportamiento esperado, no un fallo. Pasos:

1. Haz clic en **"Mas informacion"**.
2. Haz clic en **"Ejecutar de todas formas"**.
3. Verifica el checksum SHA256 publicado en `#beta-downloads` contra tu descarga con `certutil -hashfile` o `Get-FileHash`.

La firma de codigo se implementara antes del release estable v1.0.

**Para testers**

- Esta es la **primera beta publica**. Sigue `docs/tester-build-instructions.md` para instalar.
- El login con Google es **obligatorio**. No se puede usar la app sin cuenta.
- Plan por defecto: `free`. Para desbloquear Overlays Studio con datos live necesitas `paid` o `suite`. Mas informacion en `docs/tester-build-instructions.md` seccion 3.
- Los widgets Relative, Standings y Delta son **stable**. Pedals e Ingeniero son **tester**. Track Map e Input Telemetry/Trace siguen como **experimental** y no estan disponibles.
- Probad Delta en LMU live: valores negativos deben mostrarse en verde al mejorar y positivos en rojo al perder tiempo.
- Probad la URL de OBS desde Ajustes y confirmad que carga el perfil correcto.
- Ingeniero funciona en modo simulacion/replay; el adaptador live LMU queda para una fase posterior.
- Reportad bugs en `#beta-bug-reports` de Discord siguiendo la plantilla de `docs/tester-feedback-process.md`.
- No se publica release por cada commit; solo versiones etiquetadas.

## v0.3.x (historico no anunciado)

Las versiones `v0.3.*` son **internas y no anunciadas al publico**. Se mantienen aqui solo como rastro historico para el equipo y para evitar confusion con la nueva linea `v0.1.x`. Discord, docs publicos y el updater apuntan exclusivamente a la linea `v0.1.0.0` en adelante.

No se daran a conocer builds concretas (`v0.3.10.0`, `v0.3.9.2`, `v0.3.9.1`, etc.) en canales publicos. Si encuentras una referencia a una `v0.3.*` en una URL, changelog o captura, considera que es contenido interno antiguo y no la uses como referencia de estado actual.

Si necesitas consultar el detalle funcional de las builds internas previas, mira `docs/release-beta-operations-runbook.md` y `docs/current-plan.md`, que conservan el rastro operativo completo.
