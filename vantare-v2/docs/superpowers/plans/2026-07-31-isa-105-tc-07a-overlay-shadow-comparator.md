# ISA-105 / TC-07A — Proyección Overlay y shadow comparator

> **Ejecución:** seguir este documento corte a corte con TDD. No iniciar el
> siguiente corte si el anterior no tiene sus tests focales verdes. No conectar
> el pipeline nuevo a Studio, Desktop ni OBS en esta issue.

**Objetivo:** adaptar la proyección `overlay` v1 de Telemetry Core a la frontera
de datos que consumen los ViewModels actuales y comparar, de forma determinista
y sanitizada, los resultados del pipeline legado y del nuevo. La comparación
debe conservar las diferencias reales: ISA-105 no inventa señales que el core
todavía no demuestra.

**Arquitectura:** añadir una frontera TypeScript pura y aislada bajo
`frontend/src/overlay/telemetry-shadow/`. La frontera decodifica el payload
versionado, conserva presencia, procedencia y frescura, produce un
`TelemetrySnapshot` compatible solo con datos demostrados y construye los
ViewModels existentes mediante `widgetTypeRegistry`. Un comparator independiente
clasifica equivalencias, tolerancias y carencias por widget/campo. Un harness
explícito de diagnóstico ejecuta ambos caminos sin ser consumidor productivo.

**Tecnologías:** TypeScript estricto, React únicamente para el harness,
Vitest, Testing Library, Playwright ya instalado, Go tests existentes y los
scripts visuales/benchmark actuales. No añadir dependencias.

**Autoridades:**

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/vantare-program/execution-policy.md`
- `docs/vantare-program/handoffs/telemetry-core.md`
- `docs/adr/0004-telemetry-core-runtime.md`
- `docs/adr/0003-overlay-studio-v3-rebuild.md`
- `docs/superpowers/plans/2026-07-19-telemetry-core-microplan-07-overlay-cutover.md`
- `docs/overlays-studio/parity/isa-93/README.md`
- Linear `ISA-105`

## Invariantes

1. El pipeline legado sigue siendo el único consumidor productivo durante
   ISA-105.
2. El adaptador no accede a Wails, SSE, React, persistencia, permisos, canvas,
   renderizadores ni documentos de Studio.
3. `0`, `false` y `""` observados no se convierten en ausencia.
4. Un campo `present=false`, `freshness=missing` o `freshness=invalid` no se
   convierte en un valor utilizable.
5. Un campo `stale` se conserva como tal; no se presenta como fresh.
6. No se calcula Delta, gaps, clases, tiempos de vuelta, combustible, clima,
   daño, flags o estrategia si la proyección no los entrega.
7. Un mismatch esperado sigue contando como mismatch. La categoría explica el
   motivo, pero no lo convierte en igualdad.
8. El informe no contiene nombres de pilotos, Steam IDs, rutas, tokens, voz,
   estrategias, datos raw ni identificadores persistentes.
9. El comparator nunca baja tolerancias para hacer pasar un fixture.
10. Los 21 diseños Crystal y sus renderizadores no cambian.
11. El fondo del harness no forma parte del widget.
12. Mock y fixtures solo existen en tests/harness; nunca se anuncian como live.

## Matriz inicial de capacidad

Esta matriz debe verificarse contra el inventario de consumidores antes del
primer commit de código.

| Familia | Señal nueva demostrada | Señal aún no demostrada | Resultado shadow esperado |
|---|---|---|---|
| Pedals | throttle, brake, clutch, gear, rpm, speed | timestamps individuales del historial | comparar valor instantáneo; historial queda explícitamente parcial |
| Standings | id, nombre, posición, vueltas completadas, pit | número, clase, gaps, tiempos de vuelta, compuesto, color | filas parciales; cada campo ausente se reporta |
| Relative | identidad, posición y vueltas parciales | gaps relativos, clase y orden relativo semántico | `unsupported` hasta disponer de gaps demostrados |
| Delta | ninguno; `derive.Delta` sigue missing | delta y referencia/signo | `unsupported`, nunca `0` sintético |
| Input telemetry | controles instantáneos y muestra actual | tiempo exacto por muestra histórica | instantáneo comparable; traza parcial |
| Fuel strategy | ninguno | combustible e historial de consumo | `unsupported` |
| Flags | ninguno | global/sector/control de carrera | `unsupported` |
| Damage | ninguno | carrocería/aero/suspensión/neumáticos | `unsupported` |
| Weather | track name solamente | ambiente, pista, lluvia, viento, presión | `unsupported` salvo nombre de pista |
| Schedule | no es telemetría | calendario local | fuera de la proyección; debe conservarse como dependencia externa |
| Broadcast / H2H / Multiclass | nombre, posición y vueltas parciales | gaps, clases, equipos, colores, sectores | parcial/unsupported por campo |

---

## Corte D0 — Expediente, inventario y contrato de comparación

### Archivos

- Crear:
  `docs/telemetry-core/overlay-shadow-matrix.md`
- Modificar:
  `docs/current-plan.md`
- Modificar:
  `docs/vantare-program/handoffs/telemetry-core.md`

### Paso 1 — Inventariar consumidores reales

Enumerar las definiciones registradas en
`frontend/src/overlay/core/widget-registry.ts`. Para cada una documentar:

- campos leídos de `TelemetrySnapshot`;
- campos leídos de `scoring`;
- datos derivados o auxiliares;
- estado ante `ready`, `stale`, `missing`, `disconnected` y `error`;
- soporte real del payload `overlay.PayloadV1`;
- clasificación `comparable`, `partial`, `unsupported` o `external`.

No inferir capacidades a partir del nombre del widget. Citar ruta y símbolo que
consume cada campo.

### Paso 2 — Definir políticas cerradas

Documentar:

- campos exactos: estado, booleanos, enums, posición, vueltas y presencia;
- ratio de controles: tolerancia absoluta `1e-9` para el mismo frame;
- velocidad: tolerancia absoluta `1e-6 m/s` antes de presentación. El factor
  `3.6` entre m/s y kph es una incompatibilidad de unidad, nunca tolerancia;
- RPM: tolerancia absoluta `1e-6 rpm` para el mismo frame;
- tiempo/delta: `1e-6 s` únicamente cuando ambos pipelines entreguen una
  señal con la misma referencia;
- listas: identidad lógica, longitud y orden comparados por separado;
- strings sensibles: comparar igualdad internamente, pero redactar valores;
- campos sin señal nueva: `unsupported-by-projection`;
- campo inválido/stale/missing: categorías distintas, no un valor por defecto.

### Paso 3 — Commit documental separado

```powershell
git diff --check
git add -- docs/superpowers/plans/2026-07-31-isa-105-tc-07a-overlay-shadow-comparator.md docs/telemetry-core/overlay-shadow-matrix.md docs/current-plan.md docs/vantare-program/handoffs/telemetry-core.md
git commit -m "docs(telemetry): plan TC-07A overlay shadow"
```

**Gate D0:** worktree limpio tras commit; Linear enlaza plan y matriz; no hay
código productivo.

---

## Corte D1 — Decoder versionado que conserva calidad

### Archivos

- Crear:
  `frontend/src/overlay/telemetry-shadow/overlay-projection-v1.ts`
- Crear:
  `frontend/src/overlay/telemetry-shadow/overlay-projection-v1.test.ts`

### Paso 1 — Escribir tests rojos

Cubrir:

1. payload golden real de `internal/telemetry/projection/overlay/testdata`;
2. cero/falso/cadena vacía presentes y fresh;
3. missing con zero-value no disponible;
4. invalid aunque `present=true`;
5. stale conservado;
6. combinaciones incoherentes de `ProjectionField<T>` rechazadas:
   `present=false` con `fresh/stale/invalid` y `present=true` con `missing`;
7. versión distinta rechazada;
8. enums desconocidos y formas incorrectas rechazados;
9. `NaN`, infinito, arrays enormes o nesting abusivo rechazados por la
   frontera de transporte antes del decoder;
10. campos adicionales seguros compatibles con evolución aditiva;
11. inputs no mutados y resultado profundamente inmutable.

Ejecutar:

```powershell
pnpm --dir frontend test -- overlay-projection-v1.test.ts
```

Confirmar que falla por decoder inexistente.

### Paso 2 — Implementar decoder mínimo

El decoder debe recibir `ProjectionEnvelope` ya validado por
`telemetry-transport/contracts.ts`, exigir:

- `product === "overlay"`;
- `projectionVersion === 1`;
- payload con `capabilities`, `trackName`, `sessionType`,
  `playerVehicleId`, `vehicles` y `controlsHistory`;
- `ProjectionField<T>` con `present`, `value`, `provenance`, `freshness`;
- el zero-value serializado por Go de un `ProjectionField<T>` ausente se
  acepta, pero su dominio solo se valida cuando `present=true`;
- `controlsHistory.present` significa que existen muestras y su `freshness`
  describe el estado actual: no se reutiliza la coherencia de
  `ProjectionField<T>`;
- IDs locales tratados como opacos;
- límites de vehículos e historial iguales o más estrechos que el core.

No convertir todavía a `TelemetrySnapshot`.

### Paso 3 — Verificar

```powershell
pnpm --dir frontend test -- overlay-projection-v1.test.ts
pnpm --dir frontend exec eslint src/overlay/telemetry-shadow/overlay-projection-v1.ts src/overlay/telemetry-shadow/overlay-projection-v1.test.ts
git diff --check
```

**Gate D1:** parser puro, sin imports de Wails/SSE/React y sin defaults
engañosos.

---

## Corte D2 — Adaptador honesto a `TelemetrySnapshot`

### Archivos

- Crear:
  `frontend/src/overlay/telemetry-shadow/overlay-projection-adapter.ts`
- Crear:
  `frontend/src/overlay/telemetry-shadow/overlay-projection-adapter.test.ts`

### Paso 1 — Escribir tests rojos de mapeo

Validar:

- `capturedAt` RFC3339 → epoch ms finito, pero no comparable sin correlación
  explícita del mismo frame;
- `sessionType` solo usa valores conocidos;
- track missing no se vuelve `""`;
- player por igualdad con `playerVehicleId`;
- `speedMps × 3.6` en el nuevo `TelemetrySnapshot`, mostrando como mismatch que
  el adapter legado etiqueta hoy m/s como `speedKph`;
- controles `0..1`, gear y RPM del player;
- `position → place`, `completedLaps → totalLaps`,
  `inPit → inPits`; `name` queda solo en quality/diagnóstico y no se emite
  como `name` ni `driverName`, porque ambos lectores actuales lo presentan
  como piloto;
- `isPlayer` derivado del ID del frame, no del orden;
- status de transporte `stale` degrada el snapshot completo; un campo stale
  aislado conserva su valor y queda marcado en `quality` sin degradar widgets
  que no consumen ese campo;
- invalid/missing queda `undefined`;
- no-player no contamina los controles del player;
- IDs y nombres no se incorporan a mensajes de error;
- no se fabrican delta, gaps, fuel, tiempos, clase, flags, ambiente o daño.

El resultado debe ser una unión explícita:

```ts
type OverlayProjectionMapping =
  | {
      kind: "mapped";
      snapshot: TelemetrySnapshot;
      quality: readonly OverlayMappedField[];
      unsupported: readonly OverlayUnsupportedField[];
    }
  | {
      kind: "blocked";
      code:
        | "captured-at-invalid"
        | "session-type-unavailable"
        | "player-unavailable"
        | "player-in-pit-unavailable";
      quality: readonly OverlayMappedField[];
      unsupported: readonly OverlayUnsupportedField[];
    };
```

La metadata de calidad es diagnóstica y separada: no ampliar
`TelemetrySnapshot` para filtrar internals en todos los renderizadores.

### Paso 2 — Implementación mínima

- Construir objetos nuevos; nunca mutar payload.
- Mantener `scoring` como registros compatibles solo con claves demostradas.
- Solo construir `TelemetrySnapshot` cuando `session.type`, player e `inPit`
  satisfacen sus invariantes obligatorios. No usar `race`/`false`, casts o
  snapshots placeholder cuando falten.
- No mapear `controlsHistory` a tiempos inventados. Exponer su cobertura en
  `quality/unsupported`; el historial continuo se evaluará con frames reales en
  ISA-106.
- Si el status de transporte es `stale/degraded/error`, respetarlo mediante un
  argumento explícito; no leer stores globales. La frescura por campo permanece
  en `quality`: `TelemetrySnapshot` no puede representarla sin perder
  granularidad y esta issue no debe ampliar todos los ViewModels.
- El estado `ready` solo significa que el frame es utilizable, no que todos los
  widgets tengan datos.

### Paso 3 — Verificar

```powershell
pnpm --dir frontend test -- overlay-projection-adapter.test.ts
pnpm --dir frontend exec eslint src/overlay/telemetry-shadow/overlay-projection-adapter.ts src/overlay/telemetry-shadow/overlay-projection-adapter.test.ts
git diff --check
```

**Gate D2:** cero legítimo preservado y todos los huecos visibles.

---

## Corte D3 — Proyección a ViewModels y comparator por campo

### Archivos

- Crear:
  `frontend/src/overlay/telemetry-shadow/overlay-shadow-comparator.ts`
- Crear:
  `frontend/src/overlay/telemetry-shadow/overlay-shadow-comparator.test.ts`
- Crear:
  `frontend/src/overlay/telemetry-shadow/overlay-shadow-sanitizer.ts`
- Crear:
  `frontend/src/overlay/telemetry-shadow/overlay-shadow-sanitizer.test.ts`

### Paso 1 — Construir ambos ViewModels reales

La función de comparación recibe:

- snapshot legado ya normalizado;
- un `OverlayProjectionMapping` de clase `mapped`; `blocked` produce reporte
  no comparable sin invocar builders;
- widgets/documento explícito;
- políticas cerradas.

Para cada widget:

1. resolver la definición en `widgetTypeRegistry`;
2. parsear el contenido del propio widget;
3. construir el ViewModel legado;
4. construir el ViewModel nuevo con exactamente el mismo contenido;
5. comparar estructuras sin invocar renderizadores.

No usar `createDefault` cuando el harness recibe un documento: comparar la
configuración real evita ocultar campos opcionales.

### Paso 2 — Escribir tests rojos

Cubrir al menos:

- las 18 definiciones registradas;
- los cuatro pilares: Delta, Standings, Relative y Pedals;
- igualdad exacta;
- diferencia numérica dentro/fuera de tolerancia;
- field missing, stale, invalid y unsupported;
- lista reordenada, fila añadida/omitida y player incorrecto;
- cero versus ausencia;
- límite máximo de mismatches;
- orden estable por widget/path;
- snapshot o ViewModel no mutado;
- excepción de una definición convertida en mismatch controlado;
- ninguna comparación de CSS, DOM, canvas o fondo.

### Paso 3 — Clasificaciones

Usar un vocabulario cerrado:

- `equal`
- `within-tolerance`
- `value-mismatch`
- `missing-legacy`
- `missing-projection`
- `stale-projection`
- `invalid-projection`
- `unsupported-by-projection`
- `shape-mismatch`
- `builder-error`
- `external-consumer`

Race Schedule usa `external-consumer`: sigue cubierto entre los 18 tipos, pero
queda fuera del denominador de paridad telemétrica.

Cada regla de un path del ViewModel declara también sus `sourcePaths`. Si una
fuente está stale/invalid/missing, el campo no puede clasificarse `equal` aunque
el valor renderizable coincida.

El resumen contiene:

- número total de widgets y campos;
- igualdad, tolerancias y mismatches;
- cobertura por widget;
- paths sanitizados;
- reglas aplicadas;
- versión de contrato.

### Paso 4 — Sanitización

El informe serializable:

- puede contener números no identificables;
- reemplaza cualquier nombre, equipo, ID o ruta por `<redacted>`;
- no contiene el payload original;
- no contiene `TelemetrySnapshot` completo;
- limita longitud, profundidad y cantidad;
- usa códigos estables en errores;
- es determinista byte a byte para el mismo input.

Los tests inyectan canarios únicos en nombres, equipos, IDs, rutas y errores.
Ninguno puede aparecer en el reporte, JSON o DOM. Los paths solo pueden usar
índices o aliases deterministas, nunca IDs del payload.

### Paso 5 — Verificar

```powershell
pnpm --dir frontend test -- overlay-shadow-comparator.test.ts overlay-shadow-sanitizer.test.ts
pnpm --dir frontend exec eslint src/overlay/telemetry-shadow
git diff --check
```

**Gate D3:** todos los consumidores inventariados tienen resultado y ninguna
carencia se transforma en PASS.

---

## Corte D4 — Harness explícito y evidencia reproducible

### Archivos

- Crear:
  `frontend/telemetry-overlay-shadow-harness.html`
- Crear:
  `frontend/src/telemetry-overlay-shadow-harness/main.tsx`
- Crear:
  `frontend/src/telemetry-overlay-shadow-harness/TelemetryOverlayShadowHarness.tsx`
- Crear:
  `frontend/src/telemetry-overlay-shadow-harness/TelemetryOverlayShadowHarness.test.tsx`
- Crear:
  `frontend/scripts/telemetry-overlay-shadow.playwright.mjs`
- Modificar:
  `frontend/package.json`

### Paso 1 — Crear harness no productivo

El harness:

- se abre únicamente mediante su HTML explícito;
- indica `DIAGNÓSTICO SHADOW — NO LIVE`;
- permite seleccionar escenarios fijos `equal`, `partial`, `stale`,
  `disconnected` y `unsupported`;
- muestra resumen por widget y mismatch sanitizado;
- no monta Studio, Desktop ni OBS;
- no escribe perfiles ni marca documentos dirty;
- no importa Wails/SSE;
- no representa mock como conectado a LMU;
- no incluye nombres reales.

### Paso 2 — Tests de componente

Validar:

- etiqueta diagnóstica visible;
- resumen estable;
- unsupported visible para Delta/Relative donde corresponda;
- cero visible para Pedals;
- sin raw payload ni identificadores;
- responsive sin truncar el resultado esencial.

### Paso 3 — Playwright

Capturar wide, medium y compact. Comprobar:

- cero errores de consola;
- cero errores de página;
- sin overflow horizontal global;
- reporte completo accesible;
- DOM sin rutas, nombres, IDs o claves prohibidas;
- puerto cerrado al finalizar.

Añadir script:

```json
"test:telemetry-overlay-shadow": "node scripts/telemetry-overlay-shadow.playwright.mjs"
```

No añadir el harness a navegación ni build productivo.

### Paso 4 — Verificar

```powershell
pnpm --dir frontend test -- TelemetryOverlayShadowHarness.test.tsx
pnpm --dir frontend test:telemetry-overlay-shadow
pnpm --dir frontend build
git diff --check
```

**Gate D4:** evidencia visual del diagnóstico, no una nueva pantalla de
producto.

---

## Corte D5 — Matriz final, regresión visual y rendimiento

### Archivos

- Crear:
  `docs/telemetry-core/evidence/isa-105-overlay-shadow/README.md`
- Crear:
  `docs/telemetry-core/evidence/isa-105-overlay-shadow/coverage.json`
- Crear:
  `docs/telemetry-core/evidence/isa-105-overlay-shadow/report.json`
- Crear capturas sanitizadas bajo:
  `docs/telemetry-core/evidence/isa-105-overlay-shadow/screenshots/`
- Modificar:
  `docs/telemetry-core/overlay-shadow-matrix.md`
- Modificar:
  `docs/current-plan.md`
- Modificar:
  `docs/vantare-program/handoffs/telemetry-core.md`

### Paso 1 — Generar evidencia

El `coverage.json` enumera todas las definiciones registradas y su cobertura.
El `report.json` procede del sanitizador real, no de un resumen escrito a mano.
Los PNG deben incluir metadata sidecar o índice con viewport, SHA y escenario.

### Paso 2 — Gates completos

```powershell
go test ./internal/telemetry/... ./internal/app/... -count=1
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend visual:overlay-studio
pnpm --dir frontend bench:overlay-studio-drag
pnpm --dir frontend test:telemetry-overlay-shadow
git diff --check
```

Interpretación:

- `delta-crystal-ready-studio` histórico no se regenera ni se usa para aprobar
  una desviación;
- una regresión visual nueva es bloqueante;
- el comparator/harness no debe aparecer en el benchmark productivo;
- una falla heredada se reproduce contra la base exacta antes de clasificarla.

### Paso 3 — Auditoría de alcance

```powershell
git diff --name-only 3b44d36713213ab642f47174c1b5d8234362cac0...HEAD
rg -n "telemetry-overlay-shadow|overlay-shadow" frontend/src internal
rg -n "window\\.runtime|EventOn|EventSource|fetch\\(" frontend/src/overlay/telemetry-shadow frontend/src/telemetry-overlay-shadow-harness
```

Confirmar:

- cero cambios en renderizadores, CSS, canvas, drag/resize o baselines;
- cero wiring productivo;
- cero dependencias;
- cero mock en fuentes live;
- todos los huecos para ISA-106/107 están enumerados.

---

## Corte D6 — Review adversarial y entrega

### Paso 1 — Review independiente

El reviewer debe intentar encontrar:

- mismatches omitidos;
- tolerancias demasiado amplias;
- PII en informes;
- pérdida de cero/falso;
- stale convertido a ready;
- comparación superficial de listas;
- dependencia accidental de orden;
- mutation/shared references;
- uso productivo del harness;
- mock presentado como live;
- cambios visuales o baselines regenerados;
- tests que solo verifican implementación.

Resolver P0/P1/P2 y P3 razonables. Repetir review hasta `ACCEPT`.

### Paso 2 — Commit de producto

```powershell
git diff --check
git status --short
git add -- `
  docs/superpowers/plans/2026-07-31-isa-105-tc-07a-overlay-shadow-comparator.md `
  docs/telemetry-core/overlay-shadow-matrix.md `
  docs/telemetry-core/evidence/isa-105-overlay-shadow `
  docs/current-plan.md `
  docs/vantare-program/handoffs/telemetry-core.md `
  frontend/package.json `
  frontend/telemetry-overlay-shadow-harness.html `
  frontend/scripts/telemetry-overlay-shadow.playwright.mjs `
  frontend/src/overlay/telemetry-shadow `
  frontend/src/telemetry-overlay-shadow-harness
git diff --cached --check
git commit -m "feat(telemetry): add overlay shadow comparator"
git push -u origin vantareapp/isa-105-tc-07a-proyeccion-overlay-y-shadow-comparator
```

### Paso 3 — Entrega

- PR draft contra la rama final de ISA-104, no contra `develop`, `nightly`,
  `testers` ni `master`.
- Linear `ISA-105` a `In Review`.
- Comentario final con:
  - rama/base/HEAD;
  - archivos;
  - matriz old/new;
  - checks y resultados;
  - checks omitidos;
  - capturas/evidencia;
  - P0/P1/P2/P3;
  - carencias que bloquean el cutover;
  - rollback por revert;
  - confirmación de no merge/promoción.
- Actualizar el handoff canónico y el ledger de orquestación en su rama propia.

## Stop conditions específicas

Parar este corte si:

- hace falta tocar un renderer o CSS para igualar resultados;
- se propone calcular Delta/gaps sin referencia y signo demostrados;
- la única forma de llenar un campo es copiar el valor legado dentro del
  pipeline nuevo;
- el harness requiere conectarse productivamente a Wails/SSE;
- aparecen PII o rutas en el reporte sanitizado;
- una tolerancia no puede justificarse por unidad/redondeo;
- un segundo consumidor productivo debe activarse antes de ISA-106;
- la suite visual muestra una regresión nueva;
- la matriz revela que ISA-106/107 necesita una decisión arquitectónica no
  cubierta por ADR 0004.

## Definición de terminado

ISA-105 está terminada cuando:

1. todos los consumidores Overlay registrados están inventariados;
2. el payload v1 se decodifica preservando calidad;
3. el adaptador solo expone datos demostrados;
4. ambos pipelines construyen los ViewModels reales con el mismo contenido;
5. cada campo produce igualdad, tolerancia o mismatch explicado;
6. el informe es sanitizado, acotado y determinista;
7. el harness es explícitamente no productivo;
8. los 21 diseños Crystal siguen preservados sin tocar baselines;
9. los gates aplicables pasan o una deuda heredada está reproducida;
10. review adversarial termina sin P0/P1/P2 y sin P3 razonable abierto;
11. commit, push, PR draft, Linear y handoff están completos;
12. no existe merge ni promoción.
