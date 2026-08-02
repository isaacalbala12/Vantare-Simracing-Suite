# STR-09 — Entrada manual, tabla por vuelta y fuel-save

## Resultado

ISA-144 convierte la entrada manual del workspace en datos productivos y
versionados. El usuario puede corregir promedios desde una vista rápida o
valores concretos desde una tabla de 78 vueltas. Los originales nunca se
sobrescriben: cada cambio conserva valor original, valor efectivo, motivo y
fecha, se integra en el undo/redo de STR-04 y viaja dentro del documento
persistido por STR-03.

El cálculo numérico vive exclusivamente en Go, en
`internal/strategy/manual`. React solo construye un comando con procedencia,
muestra el resultado y conserva el borrador. El mock TypeScript replica el
resultado únicamente dentro del harness visual y no es autoridad productiva.

## Contrato de entrada

`strategy.manual.v1` separa cuatro grupos:

- ritmo medio y desgaste por vuelta;
- Fuel: capacidad, cantidad utilizable/inicial, consumo, formación y reserva;
- Virtual Energy: capacidad, cantidad utilizable/inicial, consumo, formación
  y reserva, siempre como recurso diferente de Fuel;
- boxes: pérdida **por parada**, reparación y penalización manuales.

Todos los controles publican unidad y rango. Un valor no finito, fuera de rango
o incompatible —por ejemplo, Fuel inicial superior a la capacidad— se rechaza
sin ensuciar el documento y el campo vuelve al valor efectivo. Las correcciones
rápidas y por vuelta tienen restauración individual, además de undo/redo global.

La tabla guarda solo las correcciones por vuelta. Las filas sin corrección se
derivan de los promedios, evitando duplicar 78 copias del mismo dato sin perder
la vista completa.

## Cálculo

`CalculateManualPlan` agrega las vueltas validadas y reutiliza los motores de
STR-05 para Fuel y Virtual Energy. Devuelve:

- necesidad y ahorro total, por vuelta y por stint para cada recurso;
- Fuel, VE, ritmo y desgaste coherentes en cada tarjeta de stint;
- número real de paradas y pérdida por parada;
- pérdida total de boxes, reparación, penalización y total del plan.

Con cuatro stints existen tres paradas. El oráculo base fija
`3 × 22,4 + 5 + 10 = 82,2 s`; un plan de un solo stint tiene cero pérdida por
paradas. El cálculo falla cerrado si el total supera el rango numérico seguro.

STR-09 no posee todavía un modelo de impacto sobre el ritmo. Por ello la UI
muestra `Pendiente de modelo de ritmo` y nunca inventa una cifra de segundos.
Mientras cambia el borrador, el resultado anterior se neutraliza hasta recibir
una respuesta correlacionada de la nueva revisión.

## Runtime y seguridad

- Evento de entrada: `strategy:manual:calculate`.
- Resultado: `strategy:manual:result`.
- Error público sanitizado: `strategy:manual:error`.
- El bridge rechaza versión desconocida, campos extra, trailing JSON, IDs no
  válidos y payloads fuera de límite.
- Los listeners se cancelan por timeout, dispose o desmontaje y las respuestas
  de otro `commandId` se ignoran.
- Los mensajes públicos usan lista cerrada; rutas, secretos y errores internos
  no llegan al frontend.

## Evidencia visual

`pnpm --dir frontend visual:strategy-planner` usa Chrome real para comprobar:

1. corrección rápida y restauración individual;
2. actualización de tarjetas y fuel-save;
3. corrección y restauración en la tabla por vuelta;
4. rechazo visual de un valor inválido sin conservarlo en el input;
5. reparación/penalización y pérdida por todas las paradas;
6. guardado y recarga de las correcciones;
7. wide, medium y compact sin overflow global;
8. consola y errores de página en cero.

Capturas y métricas: `docs/strategy-planner/evidence/str-09/`.

## Pruebas

- Dominio Go manual, bridge y wiring `cmd/vantare`: PASS.
- Suite frontend completa: `305/305` archivos y `2.082/2.082` tests PASS.
  Happy DOM imprime dos `AbortError` al cancelar fetches durante el teardown,
  después del resultado verde; el proceso termina con código cero.
- Build TypeScript/Vite: PASS; conserva el warning heredado del chunk principal.
- ESLint focal de todos los archivos STR-09: PASS; conserva el aviso heredado
  de `.eslintignore`.
- `go vet ./internal/strategy/manual ./cmd/vantare`: PASS.
- `go test ./...`: todos los paquetes Strategy y `cmd/vantare` pasan; la suite
  global reproduce únicamente el P3 Windows heredado
  `TestConcurrentSavesDontCorruptFile` por contención de
  `app-settings.json.tmp`, fuera del diff.
- `go test -race` no se ejecutó: el Go activo tiene `CGO_ENABLED=0` y devuelve
  `-race requires cgo`. No se alteró el toolchain para ocultarlo.
- Playwright/Chrome real: PASS; wide/medium/compact, overflow global, consola y
  page errors en cero.
- `git diff --check` y parse del fragmento de changelog: PASS.

## Exclusiones

- Sin parser o inputs de Telemetry Analysis (STR-10/ISA-145).
- Sin algoritmo de desgaste histórico (STR-11).
- Sin solver, Monte Carlo, comparación óptima o replanning live.
- Sin impacto inventado sobre ritmo o tiempo total.
- Sin nueva persistencia, dependencia o fuente de datos privada.
- Sin merge ni promoción.

## Rollback

La extensión es opcional y compatible con documentos STR-08: un draft anterior
recibe los valores manuales iniciales al decodificarse. Revertir STR-09 retira
el nuevo panel, bridge y campos sin cambiar el repositorio canónico de STR-03.
