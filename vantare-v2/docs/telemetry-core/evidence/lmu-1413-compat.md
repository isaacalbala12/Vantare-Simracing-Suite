# Evidencia — Compatibilidad del driver LMU con Le Mans Ultimate 1.4.1.3

Rama `vantareapp/lmu-1413-driver-compat`, base `origin/nightly@8002085a`.
Fecha de captura: 2026-08-20.

## 1. Diagnóstico confirmado

Tras actualizarse Le Mans Ultimate a 1.4.1.3 el driver quedó en `degraded`
permanente. Se confirmaron dos causas independientes, y **ninguna de las dos es
un cambio de layout**.

### 1.1 El proceso de LMU está protegido (corregido)

`readLMUBuildEvidence` localiza el proceso `Le Mans Ultimate.exe` por Toolhelp32
y `OpenProcess` tiene éxito, pero `QueryFullProcessImageNameW` no devuelve la
ruta del ejecutable. El mismo bloqueo se observa fuera de la aplicación:
`Get-Process ... .Path` y `ExecutablePath` de WMI también quedan vacíos. Sin
ruta no se puede leer la información de versión, así que la evidencia de build
llegaba vacía.

La versión sí es legible **desde disco**:
`C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\Le Mans Ultimate.exe`
→ `FileVersion = ProductVersion = 1.4.1.3`.

### 1.2 El gate de versión no conoce 1.4.1.3 (pendiente de pinneo)

`supportedLMUVersions` solo contiene `1.3.0.0` y `1.4.0.0`. Con evidencia
`1.4.1.3`, `supportedVersion()` devuelve `("", false)` y el driver emite el
`unknownFingerprint` fijo de `format.go`:

```
LMU_Data/size=324820/evidence=insufficient
```

Ese texto resultó engañoso durante el diagnóstico: **no** indica que falte
evidencia de build, es la cadena constante que se emite ante cualquier versión
no pinneada. Con el fallback de disco ya aplicado, la evidencia se lee
correctamente y el fingerprint sigue siendo el mismo, lo que aísla el gate como
única causa restante.

## 2. El layout de 1.4.1.3 no cambió

Verificado con el juego abierto y el usuario en sesión. El mapping tiene el
tamaño esperado (324.820 bytes = `ObjectOutSize`), el lector estabilizó a la
primera sin reintentos, el sanitizador de la familia 1.4 aceptó el contenido, el
replay del frame sanitizado revalidó como `CompatibilityKnown` y el solape REST
correlacionó con la Shared Memory.

Salida literal de la sonda inicial (usuario en pista):

```
PROBE build evidence: file="1.4.1.3" product="1.4.1.3" err=<nil>
PROBE supportedVersion: version="" supported=false
PROBE diagnosticCandidate: profile=lmu.compatibilityProfile{version:"1.4.1.3", supported:true} ok=true
PROBE SM OK: sha256=1394cb9ffae363a004fadb259aeb2ebe79a982ae4d5782018fe615654aee4597 summary="build=1.4.1.3 track=Track-01 session=practice source_time=1363.600s vehicles=35 player=true"
PROBE REST OK: sha256=6733a26a24e8c4b3f9ad09d188cb3ad3b29d2b41d8bd7fa970d4082646ff708d summary="status=live vehicles=35 player=true"
```

Estos digests provienen de una sonda temporal y **no se usan para pinnear**: el
pinneo debe salir del harness formal.

## 3. Cambios aplicados

- **Fallback de evidencia por disco** (`version_windows.go`): solo actúa cuando
  el proceso no entrega el par `FileVersion`/`ProductVersion` completo. Prueba
  primero la ruta estándar de Steam y después las bibliotecas declaradas en
  `steamapps\libraryfolders.vdf`. El acceso al sistema de ficheros se inyecta
  con `diskBuildAPI`; las rutas de instalación no aparecen en errores ni logs.
- **Candidato diagnóstico** (`version.go`): `diagnosticCandidateProfile` consulta
  el conjunto cerrado `diagnosticLMUVersions` = {`1.4.0.0`, `1.4.1.3`}. No se
  tocó `supportedLMUVersions`; ser candidato no da soporte de producción. Los
  tests fijan que las versiones vecinas `1.4.1.0` y `1.4.1.4` siguen
  rechazándose, es decir que no hay coincidencia por rango ni por prefijo.
- **Harness de captura** (`capture_fixtures_windows_test.go`): herramienta de
  recolección reproducible, nunca falla por un digest desconocido.

## 4. Cómo capturar las fixtures

Con el juego abierto y en el estado pedido:

```
LMU_CAPTURE_FIXTURES=1 LMU_CAPTURE_STATE=menu|track \
  [LMU_CAPTURE_OUT=<dir>] go test ./internal/telemetry/drivers/lmu \
  -run TestCaptureLMUFixturesOptIn -count=1 -v
```

El estado `menu` exige `player=false`, lo que significa **salir de la sesión al
menú principal**. Un menú dentro de la sesión (pausa o garaje) no sirve: la
Shared Memory sigue publicando `player=true` y el reloj de sesión sigue
avanzando.

## 5. La Shared Memory se limpia con retardo al volver al menu

Con Isaac ya en el menu principal, la Shared Memory siguio publicando el ultimo
frame de la sesion, con el reloj congelado, mientras el REST ya respondia vacio.
Diez sondeos espaciados 30 s lo documentan:

```
02:56:24  summary="... source_time=2051.200s vehicles=35 player=true"   standings=0B
02:56:53  summary="... source_time=2051.200s vehicles=35 player=true"   standings=0B
...
03:00:22  summary="... source_time=2051.200s vehicles=35 player=true"   standings=0B
03:00:52  summary="build=1.4.1.3 track=Track-01 session=invalid source_time=0.000s vehicles=0 player=false"
```

`source_time` quedo fijo en 2051,200 s (antes avanzaba: 1546,6 → 1623,8 → 1763,8
→ 1829,8 → 1880,4 → 1948,8 → 2051,2) y `/rest/watch/standings` paso de unos
66 KB a 0 bytes. En el sondeo de las 03:00:52 el buffer se reinicio por completo
y el estado de menu quedo observable.

**Correccion de una conclusion previa.** En un informe intermedio se afirmo que
1.4.1.3 no limpia la Shared Memory al salir al menu y que la fixture de menu era
inobtenible. Es falso: si la limpia, solo que con varios minutos de retardo
respecto al vaciado del REST. La captura de menu se obtuvo despues.

Lo que si queda como observacion real, de menor gravedad: durante esa ventana de
transicion el driver no distingue un frame congelado de uno vivo. `readStable`
compara lecturas consecutivas y un buffer detenido es perfectamente estable, asi
que el frame rancio se clasifica como `CompatibilityKnown` con `player=true`.
Mientras dura el retardo, un overlay mostraria datos de una sesion ya terminada.
No bloquea este trabajo y no se corrige aqui, pero merece issue propia.

## 6. Pinneo completado

Los SHA-256 pinneados son los digests de los **ficheros persistidos** en
`testdata/`, no de una captura en memoria: el documento REST embebe marcas de
reloj (`captured_at_utc`, `last_attempt_utc`), asi que solo un fichero
almacenado tiene digest estable. Tres capturas de menu seguidas dieron tres
digests REST distintos, todos validos; lo que se pinnea es el fichero escrito
una vez.

`supportedLMUVersions["1.4.1.3"]` queda con `requireREST: true` y los cuatro
artefactos:

| Artefacto | Fichero | SHA-256 |
| --- | --- | --- |
| Shared Memory menu | `testdata/lmu-1.4.1.3-menu-fixture.bin` | `0567b69abf96ecf4c63594293e29151bd802d6e52f30b5d5ccfb68c36e8aa4e0` |
| REST menu | `testdata/lmu-1.4.1.3-rest-menu-fixture.json` | `5db40a287ab52d5c85f4101b4ca275854869a59b4717fd7cca4452aeaac31ecb` |
| Shared Memory pista | `testdata/lmu-1.4.1.3-track-fixture.bin` | `52ff620c80fb464ef7032431fac39e26d547cbde42480bd5238b1c60fcae06b1` |
| REST pista | `testdata/lmu-1.4.1.3-rest-track-fixture.json` | `79f7691e70d936546ec09c4555fda170b6d44e513aced2ae67aecd1c22e92e1e` |

Menu capturado con `session=invalid source_time=0.000s vehicles=0 player=false`;
pista con `session=practice source_time=259.000s vehicles=18 player=true` y
`status=live` en el REST correlacionado. Antes de capturar pista se comprobo que
el reloj avanzaba entre lecturas (221,0 → 231,6 → 242,0 s) para no fijar un
frame congelado de la ventana de transicion.

Dato notable: el digest de la Shared Memory de menu de 1.4.1.3 es **identico**
al `menuSHA256` ya pinneado para 1.4.0.0. El frame de menu sanitizado es byte a
byte el mismo en ambas versiones, lo que confirma de forma independiente que el
layout no cambio.

Los ficheros `.bin` estan versionados con `git add -f` porque `/testdata/*.bin`
figura en `.gitignore`, igual que las fixtures de 1.4 ya presentes. Sin ellos
los tests de pinneo no pueden verificar los digests.

## 7. Verificacion

Smoke opt-in con el usuario en pista:

```
LMU_LIVE_SHARED_MEMORY_TEST=1 go test ./internal/telemetry/drivers/lmu -run Live -count=1 -v

live_windows_test.go:38: normalized LMU build="1.4.1.3" supported=true
live_windows_test.go:62: runtime state="live" player-present=true fingerprint="LMU_Data/runtime:build=1.4.1.3;size=324820;evidence=active-grid-bijective;telemetry=player-id-correlated"
--- PASS: TestLiveLMUSharedMemoryOptIn (0.05s)
```

Verificacion end-to-end con el binario real:

```
go build ./cmd/vantare
vantare -http 127.0.0.1:39263 -live=true -profile configs/example-racing.json

2026/08/20 03:14:20 telemetry source: state=detecting available=false reconnectAttempt=0
2026/08/20 03:14:21 telemetry source: state=live available=true reconnectAttempt=0
```

Un primer intento de e2e dio `state=stale available=true` porque la sesion
estaba en pausa y el reloj de la Shared Memory no avanzaba. Es el
comportamiento correcto y aporta un dato util: el runtime **si** detecta la
obsolescencia aunque la ruta de captura no lo haga. Se relanzo el e2e
comprobando antes que `source_time` avanzaba entre dos lecturas
(399,0 → 409,6 s), y entonces dio `state=live`.

## 8. Observaciones abiertas

- **Frame congelado durante la transicion a menu.** El driver no distingue un
  buffer detenido de uno vivo: `readStable` compara lecturas consecutivas y un
  frame congelado es perfectamente estable, asi que durante los minutos que LMU
  tarda en limpiar la Shared Memory el frame rancio se clasifica como
  `CompatibilityKnown` con `player=true`. El runtime si lo detecta y reporta
  `state=stale`, asi que el impacto queda acotado a la ruta de captura
  diagnostica. Queda como issue propia; la deteccion la aplicara el orquestador.
- **`unknownFingerprint` es ambiguo.** *(Resuelto en ISA-680; ver
  [`isa-680-lmu-version-evidence.md`](isa-680-lmu-version-evidence.md).)* `LMU_Data/size=324820/evidence=insufficient`
  se emite tanto cuando falta evidencia de build como cuando la version no esta
  pinneada. Esa ambiguedad desvio el diagnostico inicial hacia el proceso
  protegido cuando la causa era el gate.
- **Sin fragmento de changelog** *(Resuelto: ISA-680 aporta
  `docs/changelog/fragments/ISA-680.json`.)*: `docs/changelog/fragments/schema.json` exige
  `^(ISA-[0-9]+|TC-[0-9A-F]{12})$` y no hay numero de Linear todavia.
