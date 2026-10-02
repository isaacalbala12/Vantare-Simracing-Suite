# VAN-742 / ISA-1310 — validación conjunta del ingeniero

Estado: composición y validación local revisadas; CI por head en Notion/PR.
Sin integración ni promoción.
Tarea: https://app.notion.com/p/3e3e51695c6581a5aeb7ffca7dec48f6
Base: `nightly@ae5a1482a85674963b30b1fe5f9cd54de8b19921` (Wails beta.24).
Rama: `vantareapp/isa-1310-engineer-joint-validation`.

## Alcance y pipeline

Isaac autoriza actualizar las cuatro ramas y comprobarlas juntas antes de
integración. Se conserva el ciclo del [plan aprobado](../engineer/PLAN.md):
plan y contraste CrewChief predeterminado → desarrollo/composición → segundo
contraste y revisión. No se reabre el diseño documental ni se inicia T0a.

Los contratos previos son los microplanes [Fuel/Timings](../engineer/repair-isa-1299.md),
[Spotter](../engineer/repair-isa-1303.md) y [audio](../engineer/repair-isa-1307.md).
Sus bases, cifras y estados anteriores son evidencia histórica de las entregas
separadas. Este informe registra su composición sobre la base nueva.

## Candidatos de entrada

| Entrega | PR | Head actualizado |
| --- | --- | --- |
| Plan P0 | #1295 | `2c39306e3383a648d4f230da1cc0f8d982e8e480` |
| Fuel/Timings | #1300 | `a1ac726589319644c9636b39850c3468a0e1008a` |
| Spotter | #1304 | `b48e8724e8bdf3fced12bfc4c1d5b0beaa58455e` |
| Audio | #1308 | `de1f7b99fc981a7e46215ff5ec27a9670cfa0978` |

Cada rama incorpora ae5a1482 mediante merge, sin reescribir su historia. En
las cuatro, el diff de producto y pruebas frente a la nueva base es idéntico
al diff anterior frente a 1101f735. El conflicto al actualizar era únicamente
`roadmap.json`, regenerado desde JSON/SHA de ae5a1482; contratos vivos PASS.

La composición `9edc4abd` contiene la unión exacta de 38 archivos de las cuatro
entregas. 33 conservan exactamente el blob de su única rama de origen. Los
cinco compartidos son plan/JSON de roadmap, handoff y dos archivos de replay.
El runtime no necesita ajustes adicionales para componer las reparaciones.

## Resolución de la prueba compartida

`radio_scenarios_test.go` conserva la ausencia exigida de `fuel.for_pit_now`
y los dos avances de 151 ms que protegen la frontera estricta de clear.

`multi-cycle.golden.json` parte de la expectativa Fuel/Timings: 57 eventos,
sin la orden de parar, conservando sus IDs, orden, intents y métricas. Se
aplican únicamente los desplazamientos temporales de la expectativa Spotter:
steps 0–3: +0 ms; 4–6: +1 ms; 7–10: +2 ms. Cambian 43 valores `atMs`.
Se deriva comparando los dos contratos ya revisados, sin regenerar el resultado
esperado desde el runtime. Las cifras 61 eventos/47 tiempos del microplan
Spotter describen su prueba aislada, que aún contenía la orden Fuel retirada.

El roadmap conserva exactamente los hitos `engineer-crewchief-parity` y
`engineer-radio-spotter`; el segundo combina los textos de las tres reparaciones
en los cuatro idiomas. El JSON se genera siempre desde ae5a1482, de modo que
los commits candidatos no se publican como entregados en nightly.

## Referencia y comprobación posterior

CrewChief fijado: `4c3865e09a347d4c806c0bc0cd66aae335fbc610`, con ajustes
predeterminados. Los microplanes conservan fuentes, blobs y límites. Timings:
silencios de carrera/pit/final; Spotter: diferencias de velocidad mundo estrictas
por eje y clear estrictamente posterior a 150 ms; audio: fin por evento y
ninguna pausa fija entre mensajes. No se copia código ni assets de CrewChief.

El probe original de VAN-735 permanece fuera del producto, sin cambios:
SHA256 `0f584792b638a3a23231d87c7306ab147394b90f87323fb3daa93327d0c8fb8f`.
Se ejecuta por overlay que añade exclusivamente ese archivo de pruebas al
servicio real de la base y del candidato. No sustituye archivos productivos.
La repetición real confirma 8 de 9 diferencias corregidas y conserva ambos
controles positivos. La base ae5a1482 reproduce las nueve diferencias. En el
candidato solo falla `two_frames_same_sector`: aún produce gap_report con dos
observaciones del mismo sector. El probe termina con exit 1 en ambos; no se
omita ese fallo para llamar verde a la suite. El audio es un hallazgo adicional,
no convierte esa cuenta en 9/9.

| Caso original | Base ae5a1482 | Conjunto |
| --- | --- | --- |
| Práctica / clasificación / últimos 90 s | 3 FAIL | 3 PASS |
| Mismo sector en dos observaciones | FAIL | FAIL pendiente |
| Pit desconocido | FAIL | PASS |
| Fuel con tres vueltas de autonomía en última vuelta | FAIL | PASS |
| Aviso pendiente al entrar en pit | FAIL | PASS |
| Solape nuevo con rival parado | FAIL | PASS |
| Clear tras primer vacío | 1550 ms; FAIL | 1250 ms; PASS |
| Dos controles positivos | 2 PASS | 2 PASS |

Se releen después los mismos blobs CrewChief: defaults de 12 m/s por eje,
150 ms de clear, pausas entre fragmentos/mensajes de 0, NAudio/WAVEOUT y fin
por callback. El límite temporal de audio es protección, no demora obligatoria.
La composición preserva las fronteras y los límites de los microplanes.

## Validación local y revisión

Dependencias instaladas desde el lockfile en un checkout propio: Wails runtime
3.0.0-beta.24, Node 22.23.2 y Go 1.25.0; `TMPDIR=/private/tmp` en macOS.
Build frontend del candidato y de la base PASS. No se modifica la instalación
compartida anterior ni los contratos de calidad.

| Check | Resultado |
| --- | --- |
| Unión de cambios / blobs | PASS; 38 archivos de las cuatro entradas, antes de este informe |
| Focal Engineer/Spotter/familias/radio/proyección | 40 paquetes PASS; voiceinput FAIL por VAN-741 |
| Race en siete paquetes afectados | PASS |
| Vet en esos siete paquetes | PASS |
| Compilación del test audio Windows / vet Windows en módulos afectados | PASS cruzado; no ejecuta PowerShell en macOS |
| Go global candidato | 119 paquetes PASS; cuatro paquetes FAIL de la base macOS |
| Go global base ae5a1482 | 118 paquetes PASS; esos cuatro FAIL más voiceinput intermitente |
| Calidad contra ae5a1482 | PASS, cero NEW/MOVED, política intacta |
| Contrato vivo roadmap / digest | PASS; dos IDs exactos, 21 tests de contrato y 23 de digest |
| Tres fragmentos, gofmt de 18 archivos Go y diff-check | PASS |
| Revisión independiente de composición 9edc4abd | PASS acotado, sin P1/P2 |

Los cuatro paquetes que fallan en ambos globales son `cmd/vantare` (símbolos
Windows no disponibles en macOS), Launcher (dos pruebas y timeout de 90 s),
Server (ruta absoluta Windows) y Recording SQLite (crash/permisos). No se
declara PASS global macOS. El fixture voiceinput falla en el focal candidato
y en el global base; una repetición focal independiente sobre ae5a1482 lo
reproduce 38/50 veces. Es evidencia de intermitencia, no una tasa comparable
a otras ejecuciones ni una regresión atribuida al conjunto. Su stdout con
PASS adicional sigue documentado en VAN-741; no se cambia voz ni se relaja
el protocolo.

El reviewer reconstruye el golden sin usar el runtime: 11 tiempos +1 ms y
32 tiempos +2 ms, mismos 57 eventos y demás campos de Fuel. Comprueba 19
archivos de runtime/tests idénticos al propietario y los dos compartidos;
no encuentra una inversión nueva de bloqueos entre observación, ACK y audio.
Los bloques de las cuatro entregas se conservan en el handoff.

Los logs completos se conservan en el expediente local
`docs/audits/engineer-2026-09-22/joint-1310/`, fuera del repositorio de producto,
con manifiesto SHA256. La evidencia Windows ejecutada, head, CI final y estado
operativo se mantienen en [VAN-742](https://app.notion.com/p/3e3e51695c6581a5aeb7ffca7dec48f6)
y [PR1311](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1311).
Las PR1295/1300/1304/1308 repiten también sus controles en sus heads actualizados.
No trasladar el PASS histórico de 1101 al nuevo candidato ni confundir
compilación cruzada con ejecución Windows o escucha real.

Comandos principales desde `vantare-v2`:

```sh
go test -count=1 -timeout 90s ./internal/spotter/... ./internal/radio/... ./internal/engineer/... ./internal/families/... ./internal/telemetry/projection/engineer/...
go test -race -count=1 -timeout 90s ./internal/spotter/... ./internal/radio/... ./internal/families/... ./internal/engineer/audio/... ./internal/engineer/service/... ./internal/engineer/replayoracle/... ./internal/telemetry/projection/engineer/...
go vet ./internal/spotter/... ./internal/radio/... ./internal/families/... ./internal/engineer/audio/... ./internal/engineer/service/... ./internal/engineer/replayoracle/... ./internal/telemetry/projection/engineer/...
go test -count=1 -timeout 90s ./...
```

## Límites y siguiente puerta

- T0a espera P0 integrado; T0b requiere revisión humana del ledger y anomalías.
- Muestreo Timings dentro del mismo sector y T1–T8 continúan pendientes.
- No se certifica el estimador RF2 de 200 ms, primer encuentro, modo oval ni
  doble rival por lado; consultar el alcance exacto del microplan Spotter.
- Audio conserva PowerShell/WPF y ACK started anterior al primer sonido.
  No hay medición acústica ni acreditación de p95 <150 ms.
- El fixture de voz VAN-741, reproducido en la base, se mantiene separado.
- Las cuatro PR de origen permanecen abiertas; la composición no las cierra
  ni fusiona automáticamente. No hay integración ni promoción desde esta tarea.

Para la verificación humana: Windows/LMU, circuito y sensibilidad normales,
comparar rival a igual velocidad/parado, primer vacío y clear; observar
silencios Timings y ausencia de órdenes Fuel injustificadas; escuchar clips,
cancelación y prioridad Spotter. Registrar decisión, ACK y primer sonido por
separado. Una prueba sintética no sustituye esa sesión.
