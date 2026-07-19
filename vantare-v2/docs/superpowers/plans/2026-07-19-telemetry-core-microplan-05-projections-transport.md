# TC-05 — Proyecciones y transporte

**Objetivo:** ofrecer contratos estables por producto sin serializar ni filtrar el snapshot canónico directamente.

## ISA-39 / TC-05A — Proyecciones versionadas por producto

- Definir envelopes y proyecciones v1 para Overlay, Engineer, Strategy y Analysis.
- Overlay/Engineer incluyen únicamente campos realmente consumidos.
- Strategy/Analysis pueden comenzar como contratos documentados/compile-only; no implementan sus productos.
- Separar versión canónica, versión de proyección y versión de recording.
- Definir cambios aditivos, breaking changes, deprecation y fixtures de compatibilidad.

**Tests:** golden JSON por proyección, missing/quality, no leakage de raw/internal fields y compatibilidad de versión.

## ISA-40 / TC-05B — Wails/SSE con resync

- Wails y SSE publican la misma semántica de proyección aunque usen transportes distintos.
- Envelope: projectionVersion, epoch, sequence, full/delta, capturedAt y statusRevision.
- Al suscribirse: full snapshot; ante gap: resync completo.
- Diff es optimización y puede desactivarse sin cambiar corrección.
- Validar límites/tamaños y mantener servidor local-only.
- Estado bajo ritmo separado de payload de alta frecuencia.

**Tests:** late join, gap, reconnect, payload inválido, consumer lento, full/delta equivalence y lifecycle.

## ISA-41 / TC-05C — Contratos TypeScript y harness compartido

- Crear decoder TypeScript estricto por versión y una store común.
- Wails/SSE adaptan al mismo contrato; no duplican reglas de dominio.
- Añadir harness de observabilidad con snapshot/status/sequence y teardown.
- No migrar todavía las pantallas productivas.
- Evitar `any`, casts silenciosos y fallback a fixtures.

**Tests:** Vitest de decoder/store/transports, fixture Go<->TS, build y Playwright del harness.

## Gate TC-05

- Proyecciones pequeñas y revisables; ningún producto importa schema/core directamente.
- Wails/SSE se resincronizan de forma determinista.
- Payloads y versiones documentados.
- Isaac puede inspeccionar datos/status desde el harness.

## Stop conditions

- un transporte serializa el snapshot canónico;
- reglas de calidad/fusión se duplican en TypeScript;
- diff es necesario para corrección;
- Strategy/Analysis empiezan a tomar decisiones de producto;
- un decoder acepta silenciosamente una versión desconocida.
