# ISA-894 · R3 Studio V2-only

## Objetivo

Retirar del ciclo productivo de Overlay Studio la creación y ejecución del
adapter Overlay Projection V1. Studio debe seguir consumiendo OverlayFrame V2
mediante la sesión pull Wails existente, sin introducir otra fuente, store o
coordinador.

Base congelada: `cc443e53ffa2ab0bf85fa62abb420fb72778bfa3` (R2).

## Alcance cerrado

- `frontend/src/hub/overlay-studio/StudioRoute.tsx`
- `frontend/src/hub/overlay-studio/studio-overlay-telemetry.ts`
- `frontend/src/hub/overlay-studio/studio-overlay-telemetry.test.ts`

Se permite añadir evidencia y actualizar el handoff/roadmap al cerrar el
corte. No se modifican en R3 los mocks de autoría de
`StudioTelemetryProvider`, fixtures, OBS, backend, rutas SSE/Wails, productor,
flags, tipos compartidos ni adapters legacy todavía usados por otros
consumidores.

## Contrato que debe preservarse

1. El coordinador de Studio sigue siendo único y se recibe explícitamente.
2. Al iniciar una generación Live se resetea el store V2.
3. Los listeners V2 se adjuntan antes de `pull.start()`.
4. `start()` y `stop()` son idempotentes; un reinicio vuelve a revisión 0.
5. Un fallo de arranque limpia pull y listeners y conserva el error original.
6. Un frame/status V2 sigue actualizando el store y el coordinador enlazado.
7. El callback de frame inválido continúa publicando `invalid-frame` en el
   coordinador.
8. La limpieza de React detiene solo recursos propios y no dispone un
   coordinador inyectado.

## TDD obligatorio

### RED

Actualizar primero el test focal para exigir un lifecycle Studio V2-only:

- no existe ni se invoca un lifecycle V1;
- los listeners V2 preceden a `pull.start()`;
- start/stop/restart conservan reset y cleanup;
- el fallo de `pull.start()` desmonta listeners y repropaga el error.

El test debe fallar contra la implementación R2 por la dependencia/ejecución
de `legacy` antes de tocar producción. Registrar comando y causa literal.

### GREEN

- Reemplazar `legacy` en las opciones por el coordinador ya creado.
- Mantener `TelemetryAdapter` como frontera de lifecycle; no crear una nueva
  abstracción.
- Eliminar de `StudioRoute` el import y la construcción del adapter V1.
- Pasar el coordinador al adapter Studio V2-only.
- Implementar la mínima limpieza necesaria para pasar el contrato.

## Gates

- test focal RED registrado y luego GREEN;
- tests focales Studio/telemetría relacionados;
- `pnpm --dir frontend typecheck`;
- `pnpm --dir frontend build`;
- lint de los archivos tocados o lint global si es viable;
- `git diff --check`;
- búsqueda que pruebe que `StudioRoute` y `studio-overlay-telemetry` ya no
  importan, construyen ni arrancan V1;
- revisión fresca de cumplimiento y después revisión fresca de calidad.

## Cierre

Documentar evidencia, actualizar el handoff vivo y el hito de telemetría del
roadmap sin declarar retirada total de V1. Crear PR draft apilada sobre R2. No
mergear ni promover a `nightly` sin autorización explícita de Isaac.
