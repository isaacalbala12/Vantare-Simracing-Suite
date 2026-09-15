# ADR 0096 — contrato del centro de notificaciones

2026-09-15, ISA-901 (issue #901, paraguas #899). El contrato cruza
frontend/backend: se fija aquí como decisión canónica.

## Contexto

Los avisos ya existían pero cada productor hablaba por su canal: el updater
emitía `updater:notify`/`updater:error`, el launcher llamaba al toast de
Windows a través de `notifyingEmitter`, y nada guardaba lo que ya se había
mostrado. Una reconexión del webview perdía todo lo emitido y no había un
sitio donde recuperar un aviso descartado.

## Decisión

`internal/notify.Center` es el store acotado (50 registros) y la única
autoridad de avisos recientes. Publica el snapshot completo en
`notifications:center` tras cada mutación; un webview reconectado pide
`notifications:center:get` una vez y queda al día. `revision` ordena los
snapshots para descartar entregas viejas.

Contrato versionado (`CenterContractVersion`): `id`, `source`, `severity`,
`occurredAt`, `dedupeKey`, `titleKey`/`textKey` + `params`, `concreteCause`
acotada y `action` opcional. Título y texto son claves i18n resueltas en el
frontend; `Fallback` lleva la frase plana para el canal Windows y no cruza
al frontend.

- **Dedupe** por `dedupeKey`: una repetición con la misma firma actualiza
  `occurredAt` en silencio (sin unread ni toast); una firma distinta es una
  ocurrencia nueva que resurfaces como no leída.
- **Matriz de canales por fuente**: `updater`/`launcher` → hub+windows+history;
  `system` (prueba manual) → hub+history sin Windows, porque su toast de
  prueba deliberadamente ignora mute/minimizado.
- **Muting por fuente**: una fuente silenciada sigue quedando en history,
  pero aterriza ya leída (no levanta badge) y no tostada.
- **Acciones**: solo `navigate` a destinos de la allowlist del backend
  (`settings:updates`, `launcher`). El frontend envía el `id`; el backend
  revalida la acción almacenada, marca leído y emite
  `notifications:center:navigate` con el target semántico.
- **Windows fuera del mutex**: `Publish` invoca el canal tras soltar el lock;
  `main` lo ejecuta en goroutine propia para no bloquear el bus.

## Exclusión del Spotter por construcción

`Source` es un conjunto cerrado y `spotter` no está en él: `Publish` rechaza
con `ErrSourceDenied` cualquier registro sin política de canal. La salida de
carrera del Spotter sigue siendo overlay/subtítulos/audio y no puede crear
registros del centro ni alcanzar toasts de Windows.

## Adaptadores

- `centerEmitter` envuelve el emitter del launcher: `launcher:chain:done`
  produce el registro de resultado (éxito/fallo) con acción a Launcher.
- Updater publica `updater:update:<tag>` (dedupe por versión), errores con
  `concreteCause` y el arranque del instalador.
- La prueba manual de Ajustes queda registrada en `system:test`.

## Coste y límites

Store en proceso, sin persistencia: historial reciente, no archivo. Payloads
libres acotados (causa 240, 8 params × 120, keys 120). Una fuente nueva exige
decisión de contrato (añadir a la matriz), no una llamada más.
