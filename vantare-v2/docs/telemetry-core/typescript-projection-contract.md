# TC-05C — Contrato TypeScript de proyecciones

Fecha: 2026-07-30. Alcance: decoder/store y harness browser no productivo.

## Frontera

`frontend/src/telemetry-transport` es la única interpretación TypeScript del
transporte definido por TC-05B. Acepta únicamente los cuatro productos
cerrados (`overlay`, `engineer`, `strategy`, `analysis`) y sus eventos
namespaced:

```text
telemetry:<producto>:status
telemetry:<producto>:projection
telemetry:<producto>:fact
```

Las rutas equivalentes son
`/telemetry/<producto>/projection` y `/telemetry/<producto>/facts`. El módulo
no importa código Go, drivers, estado canónico, ViewModels ni pantallas. El
payload de producto permanece como objeto JSON opaco: cada producto es dueño
de su contrato v1 y sus consumidores posteriores lo adaptarán.

## Decoder y límites

El decoder único valida producto, evento, versión de proyección, cursor,
timestamp UTC, revisión de status y tamaño máximo de 256 KiB. JavaScript no
puede representar todos los `uint64` exactamente, por lo que rechaza cursores
fuera de `Number.MAX_SAFE_INTEGER` en vez de redondearlos silenciosamente.

Solo se admite projection v1. Una futura versión requiere publicar primero su
decoder y fixtures. Se rechazan payloads que no sean objetos JSON, valores no
finitos, profundidad superior a 64, claves privadas de Core/raw y claves que
podrían alterar prototipos JavaScript. Los diagnósticos nunca incluyen payload,
rutas personales o identidad.

Los campos conocidos y sus tipos siguen siendo obligatorios, pero envelope y
status toleran extensiones JSON aditivas seguras para que una ampliación
compatible no rompa consumidores antiguos. Las extensiones pasan los mismos
guards de profundidad y claves prohibidas. El máximo público nunca puede
superar 256 KiB: una opción válida solo puede reducirlo y un override inválido
se rechaza.

Los tests leen directamente los cuatro golden v1 de Go, retiran únicamente la
metadata que el envelope ya transporta y prueban el payload observable. Un
fixture compartido, validado por ambos lenguajes, fija productos, eventos,
rutas, estados, versión y límite. Así el browser no mantiene una segunda copia
inventada de los esquemas ni puede derivar silenciosamente del transporte Go.

## Store

Cada producto posee una instancia aislada:

- status debe avanzar de uno en uno;
- un status nuevo retira el snapshot de otra revisión hasta recibir el full
  coherente;
- ese full puede reutilizar cursor y payload si es exactamente el mismo frame
  lógico; debe conservar `capturedAt` y solo actualizar `statusRevision`;
- el primer snapshot y cada cambio de epoch exigen full;
- delta usa JSON Merge Patch RFC 7396 y exige continuidad;
- un gap recibido como full se acepta como resync explícito;
- duplicados de reconnect son idempotentes si coinciden exactamente;
- regresiones de epoch/secuencia se rechazan;
- facts conservan cursor independiente, no se coalescen y un gap exige resync;
- listeners y teardown tienen un único owner e idempotencia;
- el montaje revierte listeners ya creados si falla una suscripción y el
  desmontaje intenta todos los removers aunque uno falle.

TC-05B ya verifica que cada delta reconstruye el full retenido antes de
publicarlo. TypeScript vuelve a validar forma, límites y continuidad y aplica
el patch; no intenta inventar un segundo full de autoridad.

## Harness

`createTelemetryTransportHarness` es explícito y no productivo. Reproduce
status, full, delta, gap, facts y reconnect para cualquiera de los cuatro
productos. Expone el estado y diagnósticos sanitizados sin abrir LMU, Wails,
SSE o una pantalla. No presenta mock como telemetría real.

No hay wiring productivo ni migración de las pantallas legacy en este corte.
TC-06 y los cortes de producto decidirán cuándo conectar cada consumidor.

## Verificación

```powershell
pnpm --dir frontend test -- src/telemetry-transport
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend exec eslint src/telemetry-transport
git diff --check
```

Playwright no corresponde: el harness es una API pura sin página, estilos,
layout ni interacción visual.

Rollback: eliminar `frontend/src/telemetry-transport`, esta guía y las notas de
estado. No hay persistencia, listeners productivos, migración ni datos que
convertir.
