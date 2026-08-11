# ISA-182 / ENG-11 — package manager y voice-host test-only

> **SNAPSHOT / ISSUE EVIDENCE.** Conserva contratos y evidencia del corte
> ISA-182; no describe por sí solo el estado actual. Consulta el
> [router Engineer](README.md) y el [handoff vivo](../vantare-program/handoffs/engineer-spotter.md).

## Resultado

ENG-11 crea la frontera operativa mínima para probar componentes de voz fuera
del proceso principal. El corte descarga artefactos fijados por un manifest
versionado, comprueba tamaño y SHA-256 y arranca un único proceso hijo local
con ownership demostrable. Sigue siendo **test-only**: no escucha micrófono,
no hace inferencia, no reconoce comandos y no está conectado al runtime de
Vantare.

El estado de release permanece:

- TTS dinámico: **NO-GO**.
- PTT, comandos y wake word: **NO-GO** hasta el corpus humano consentido.
- Radio, subtítulos y widget Crystal: fallback productivo completo.

## Alcance exacto

### Incluye

- Manifest cerrado `vantare.engineer.voice-artifacts.v1` bajo Git.
- Pin de plataforma, arquitectura, versión, tamaño, SHA-256, licencia, URL y
  hosts de redirect para cada artefacto.
- CLI explícita para consultar, descargar, eliminar y limpiar temporales.
- Descarga acotada por bytes, tiempo total, almacenamiento y cancelación.
- Promoción atómica solo después de verificar el archivo completo.
- Un voice-host hijo en `127.0.0.1`, puerto efímero, token y nonce por proceso.
- Readiness, heartbeat, PID, protocolo y nonce verificados por el padre.
- Request de prueba acotada y shutdown con terminate/kill como fallback.
- Harness reproducible de lifecycle y overhead sin inferencia.

### No incluye

- Extracción o ejecución de `whisper.cpp`.
- Carga del modelo Whisper.
- Captura de audio o acceso a micrófono.
- STT, TTS, comandos, PTT o wake word.
- Wiring con Engineer, Spotter, Telemetry Core, Wails o UI.
- Nueva dependencia de producto.
- Modelos, binarios, ZIP, audio, rutas personales o raw en Git.

## Artefactos fijados

El único manifest admitido por las CLIs de operador es
`tools/engineer-voice-bench/voice-artifacts.v1.json`. Las rutas alternativas
solo existen como inyección interna de tests.

| ID | Versión | Tamaño | SHA-256 | Licencia |
|---|---:|---:|---|---|
| `whisper-cpp-server-windows-x64` | `1.9.1` | 7.982.101 B | `7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539` | MIT |
| `whisper-base-multilingual` | commit `5359861c…` | 147.951.465 B | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` | MIT |

El parser rechaza campos desconocidos o ausentes, IDs duplicados, filename no
seguro, URL no HTTPS, credenciales o fragmentos en URL, host fuera de allowlist,
plataforma/arquitectura incorrecta, licencia vacía y límites fuera de contrato.
El modo HTTP solo existe por inyección test-only y solo acepta loopback.

## Almacenamiento y promoción

- El root debe estar fuera de cualquier worktree Git.
- Cada componente existente de la ruta se revisa contra symlink, junction y
  reparse point antes de leer, escribir o eliminar.
- La descarga escribe un `.part` único en `.tmp`, hace streaming con límite,
  `flush` y `fsync`, y valida tamaño y hash antes de promocionar.
- Un lock de archivo cross-process deja un único instalador por root. El
  preflight cuenta el target actual, el nuevo `.part`, el lock y cualquier
  temporal previo: el pico real nunca rebasa el límite configurado.
- Si un `force` vuelve a descargar un artefacto que ya está verificado contra
  el mismo manifest, la descarga se audita pero el target queda intacto. Esto
  evita una denegación transitoria de apertura durante `replace` en Windows.
- Un target missing o corrupto sí se sustituye atómicamente después de validar
  el temporal completo.
- Un fallo, timeout, redirect inválido o cancelación conserva cualquier target
  válido previo y elimina el parcial.
- La eliminación solo acepta un ID del manifest y nunca sigue links ni una ruta
  reconstruida por el usuario.

## Ownership del voice-host

El controller es la única autoridad del proceso hijo. Antes de arrancar exige
que todos los artefactos requeridos estén verificados. Después:

1. Genera token de 256 bits y nonce de 128 bits exclusivos del proceso.
2. Arranca el hijo con prioridad inferior en Windows y sin stdin.
3. Exige readiness JSON exacta, limitada a 4 KiB.
4. Verifica protocolo, PID de `Popen`, loopback, puerto y nonce.
5. Hace heartbeat autenticado para probar que ese PID posee el puerto.
6. Serializa requests test-only y limita request/response a 64 KiB.
7. Ante timeout, respuesta inválida, crash o pérdida de ownership, cierra el
   hijo, lo recolecta y libera el puerto.
8. En `stop`, intenta shutdown; después usa terminate/kill acotados.
9. Elimina token, nonce y lease. Conserva únicamente `last_pid` y
   `last_exit_code` para auditoría local.

Los timeouts se validan como números finitos y positivos: start máximo 60 s,
request máximo 120 s y shutdown máximo 30 s. Una espera de readiness que
vence conserva `HostTimeoutError`; no se disfraza como error genérico.

El token de loopback prueba ownership entre el controller y su hijo; no es una
frontera contra otro proceso malicioso ejecutado por el mismo usuario de
Windows, que puede inspeccionar su propio entorno o depurar procesos. Por ello
este host no expone operaciones de producto, no acepta audio y sigue test-only.

## Ejecución de operador

Los comandos requieren un root externo a Git. Ninguno se ejecuta en producto.

```powershell
python tools/engineer-voice-bench/voice_artifact_cli.py `
  --root C:\VantareTest\voice `
  --limit-bytes 536870912 status

python tools/engineer-voice-bench/voice_artifact_cli.py `
  --root C:\VantareTest\voice `
  --limit-bytes 536870912 install whisper-base-multilingual `
  --confirm DOWNLOAD
```

La CLI solo imprime ID, versión, estado y bytes. No imprime URL, path, token o
nonce. `remove` exige `--confirm REMOVE`; `cleanup`, `--confirm CLEANUP`.

El harness exige que los artefactos ya estén instalados y verificados:

```powershell
python tools/engineer-voice-bench/voice_host_harness.py `
  --artifact-root C:\VantareTest\voice `
  --output C:\VantareTest\voice-host-lifecycle.json `
  --iterations 200
```

## Evidencia

`docs/evidence/isa-182/lifecycle-summary.json` documenta 200 probes sobre un
artefacto sintético externo. Demuestra únicamente lifecycle/overhead:

- `probe_only=true`.
- `inference_executed=false`.
- `command_readiness=NO-GO`.
- shutdown limpio y cero leases.

No demuestra precisión, latencia STT, calidad TTS ni aptitud del modelo real.
Los tests adversariales cubren schema cerrado, hash/tamaño, redirects, timeout
total, cancelación, límites, symlink/junction/reparse, reinstall seguro,
instalación concurrente con un único owner, temporales preexistentes, arranque
concurrente, PID/protocolo falsos, readiness ausente, respuesta
inválida/sobredimensionada, crash, puerto ocupado, shutdown colgado, carrera
stop/request y lifecycle repetido.

## Gate siguiente

ENG-12 no puede reinterpretar este corte como autorización de voz. Antes de
PTT/comandos/wake word necesita corpus humano consentido del catálogo real,
intent accuracy y FAR/FRR por idioma, además de review de licencia y recursos.
El host seguirá fuera del hot path: Spotter, scheduler, Telemetry Core y visual
nunca pueden esperar a la inferencia.
