# Ajustes — rehacer la sección completa

Isaac, 2026-08-07: *"la sección de ajustes se debe de renovar completamente,
ahora mismo es terrible"*. Le molestan los cuatro frentes —cómo se ve, cómo se
organiza, lo que contiene y lo que está a medias— y el alcance acordado es
**rehacer la página entera**.

Sin issue propia en Linear: el workspace ha agotado el límite del plan gratuito,
igual que en ISA-234 e ISA-301. Este documento es la fuente hasta que haya cupo.
Hay 31 issues canceladas ocupando sitio; archivarlas desde la app de Linear
libera el cupo (el MCP no expone archivado).

## Diagnóstico medido

Base `nightly@56fde06`. `frontend/src/hub/pages/SettingsPage.tsx`, 695 líneas.

**1. La página está solo en español.** 26 cadenas visibles hardcodeadas frente a
7 llamadas a `t()`, con la app soportando es/en/pt/it. Es el defecto más grave
porque no es cuestión de gusto: un usuario italiano abre Ajustes y no entiende
nada.

**2. Dos de las tres opciones reales no hacen nada.** Buscando consumidores de
`deltaMode` y `cpuSampling` en Go y en el frontend, solo aparecen en persistencia
(`settings_service.go`), en el informe de diagnóstico (`diagnostics_service.go`)
y en mocks. Ningún código lee ninguno de los dos para cambiar comportamiento. La
pestaña "Avanzado" ofrece dos controles inertes.

**3. Un solo componente de 695 líneas** con cinco pestañas, efectos, modal y
estado. Solo `AccountSettings` está extraído.

**4. Doble borde.** `card-sleek` ya define su borde (`index.css:200`); la página
añade `border border-white/5` encima, seis veces.

**5. `bg-accent/10`** en las pestañas es un token que no aparece en ninguna otra
pantalla del Hub.

**6. Modal de downgrade hecho a mano** con `fixed inset-0`, en vez del portal +
`motion` que usan `AddNonSteamGameModal` y `LauncherScanProgress`.

**7. Pestañas con `flex-1`**: cinco de ancho idéntico; una sexta las estrangula.

No son defectos: el gradiente `vantare-burgundy` se usa en otras seis pantallas, y
`ObsSetup` no está huérfano —vive en `ObsOverlaySetupView`, dentro de Overlays,
que es un sitio razonable.

## Decisiones cerradas (2026-08-07, con Isaac)

**Estructura: cinco secciones con navegación lateral.**

| Sección | Contenido |
|---|---|
| Cuenta | sesión, plan, licencia, roles *(existe)* |
| Aplicación | idioma *(hoy suelto en la cabecera)*, arranque y ventana, notificaciones *(nuevos)* |
| Actualizaciones | canal, versiones, descarga y downgrade *(existe)* |
| Atajos | hotkeys globales *(existe)* |
| Datos y diagnóstico | ubicación, espacio, vaciar caché *(nuevos)* + paquete de diagnóstico *(existe)* |

"Avanzado" desaparece: su contenido es inerte.

**`deltaMode` y `cpuSampling` se retiran** de la UI y del modelo, con subida de
`schemaVersion` y migración que descarta los campos. Un ajuste que no hace nada
es peor que no tenerlo. Si alguna vez hacen falta, se añaden ya conectados.

**Contenido nuevo aprobado**: arranque y ventana, datos locales y notificaciones.
Los tres entran en esta vuelta.

## Cortes

**A — Descomposición.** Un componente por sección; estado y efectos a un hook.
Mecánico, sin cambio visual ni funcional. Habilita todo lo demás y hace el corte
B mucho más barato.

**B — i18n.** Las 26 cadenas en cuatro idiomas, más un test que impida que
vuelvan a colarse literales, con el mismo patrón que ya protege overlay-studio.

**C — Retirar lo inerte.** `deltaMode` y `cpuSampling` fuera de UI, de
`AppSettings` y del informe de diagnóstico. `schemaVersion` sube y la migración
descarta los campos antiguos sin romper archivos existentes. "Avanzado"
desaparece.

> **Corregido (2026-08-08): `cpuSampling` sí funcionaba.** El diagnóstico del
> punto 2 buscó consumidores en `internal/` y en `frontend/src`, y no en
> `cmd/`, que es justo donde estaba el cable: `cmd/vantare/main.go:1669` llama
> a `rtSampler.SetCPUEnabled`, que arranca y para el muestreador. Se retira
> solo `deltaMode`; `cpuSampling` vuelve, con sección propia junto al panel de
> diagnóstico, que es donde pinta un control sobre instrumentación.

**D — Navegación y acabado.** Barra lateral, lenguaje visual del Hub, modal al
patrón portal + `motion`, estado de guardado contextual en lugar del texto suelto
al pie, y retirada del doble borde y de `bg-accent/10`.

> **Hecho todo menos la barra lateral (2026-08-08).** El commit `e63c208`, de
> julio, sacó esta página *de* una barra lateral y la pasó a pestañas a ancho
> completo, con un test que lo fija (`renders horizontal tab bar (no internal
> sidebar)`). Esa decisión es anterior al plan y volver atrás no es acabado
> visual, es deshacerla: queda pendiente de que Isaac decida.
>
> Además de lo listado: las pestañas dejan de usar `flex-1` (las cuatro medían
> lo que la etiqueta más larga) y el tablist se recorre con las flechas.
> `settings.status.*` cierra las dos últimas cadenas en español que quedaban
> fuera de los diccionarios tras el corte B — vivían dentro de `useAppSettings`.

> **Barra lateral descartada, sub-barra en su lugar (2026-08-08).** Isaac:
> *"es o barra lateral o pestañas debajo de las pestañas actuales"*. Va la
> segunda: el LauncherDock ya ocupa el borde izquierdo, así que una barra
> lateral de página sería el tercer elemento vertical seguido. `V52Shell` deja
> una ranura bajo el Topbar y `HubSubnav` la rellena por portal.

**E — Arranque y ventana.** Ojo: ya existe `internal/app/launcher/autostart_windows.go`
con `RegisterAutostart`/`UnregisterAutostart`, pero **es por perfil de Launcher**
(`Vantare.<profileID>` en la clave Run), no para la app. El mecanismo de escritura
al registro se puede generalizar; la semántica es distinta y hay que decidir si
conviven ambas entradas.

**F — Datos locales.** Ruta, espacio ocupado y vaciar caché. Refuerza el mensaje
de "todo es local" que la página ya da por escrito.

**G — Notificaciones.** Qué avisa la app y cómo.

El orden importa: B sobre 695 líneas monolíticas cuesta mucho más que sobre
componentes separados, y D sin C es repintar una pestaña que va a desaparecer.

## Restricciones

- Conservar la funcionalidad existente: canal, descarga y downgrade, hotkeys,
  diagnóstico y cuenta.
- No romper el contrato de `AppSettings` sin migración; existe `schemaVersion`.
- Cada corte va por rama de issue → nightly con CI en verde.

## Estado (2026-08-08)

Cortes A-G cerrados en la PR #180. Lo que no está hecho y por qué:

- **Recordar tamaño y posición de la ventana.** Entraba en el corte E por
  nombre pero necesita escuchar eventos de redimensionado y moverse, y no he
  podido verificarlo con la app corriendo. Merece su propio corte.
- **Los cuatro módulos que importan `AppSettings` desde `SettingsPage`** siguen
  apoyados en los re-exports puente.
- **Las cadenas del toast del Launcher** (`chain-store.tsx`) siguen en español
  fijo. Están fuera de la página de ajustes, así que el corte B no las tocó.

Hallazgos que no eran del plan y sí importaban:

- `cpuSampling` **no** era inerte; ver la nota del corte C.
- `applyLoaded` reconstruye `AppSettings` campo a campo, así que un campo nuevo
  se lee del disco y se descarta en silencio. Le pasó a `notifications`.
  `TestApplyLoadedKeepsEveryPersistedField` lo recorre por reflexión y falla
  con el siguiente campo que se olvide.
- `notifyLaunchResult` era código muerto: comprobaba `Notification.permission`
  y nadie había llamado nunca a `requestPermission`. El interruptor del corte G
  es lo que ahora la pide.
- El botón "Notificaciones" del Topbar no tenía `onClick`. Retirado.
