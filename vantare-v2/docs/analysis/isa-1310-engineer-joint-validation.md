# VAN-742 / ISA-1310 — validación conjunta del ingeniero

Estado: candidato compuesto, validación en curso; sin integración ni promoción.
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
La comprobación previa virtual encontró 8 de 9 diferencias corregidas; esta
entrega debe confirmarlo en el conjunto real. El audio es un hallazgo adicional,
no convierte esa cuenta en 9/9.

## Validación en curso

Dependencias instaladas desde el lockfile en un checkout propio: Wails runtime
3.0.0-beta.24, Node 22.23.2 y Go 1.25.0. Build frontend PASS. No se modifica
la instalación compartida anterior ni los contratos de calidad.

Se están comprobando suites focal/global/race/vet, el probe original, calidad,
roadmap y CI Windows de las cuatro ramas y del conjunto. La revisión externa
usa un checkout separado. Los resultados finales se registrarán aquí y en
Notion; no se traslada automáticamente el PASS histórico de 1101 a ae5a1482.

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
