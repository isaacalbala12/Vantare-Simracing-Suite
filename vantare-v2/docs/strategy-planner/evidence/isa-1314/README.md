# ISA-1314 — Entrega local y verificación

Fecha: 2026-09-22. [Issue](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1314) · [Diseño v5](../../design/strategy-menu-desk-v5.md) · [Handoff único](../../../vantare-program/handoffs/strategy-planner.md).

## Alcance entregado

Menú previo con sesiones reales y entrada Manual; grises y composición asimétrica del concepto A v5. Mesa de combinación, referencias, reglas y pilotos con inspector acoplado. Selección de fuentes y cálculos usan los owners existentes. Manual transporta valores explícitos al mismo comando de cálculo; adoptar telemetría cambia el origen y elimina esas referencias manuales. Se mantienen selección múltiple, correcciones, revisiones, aceptación, historial, stint/parada y persistencia. No se modifica Go ni se añade dependencia.

## Checks

| Comprobación | Resultado y límite |
|---|---|
| Suite frontend completa, repetida por el orquestador sobre el corte final | 489 archivos, 4.262 pruebas aprobadas, 2 omitidas; exit 0. 80,89 s. Se imprime `AbortError` de happy-dom al desmontar; no se oculta ni se cuenta como fallo del runner. |
| Typecheck | PASS del ejecutor. La build final del orquestador vuelve a recorrer tipos con `tsc -b`. |
| Lint | PASS del ejecutor y del orquestador, exit 0; log local conservado. |
| Build frontend final | PASS tras regenerar roadmap; incluye TypeScript y Vite. |
| Auditoría i18n | PASS: paridad, 0 claves usadas ausentes y 0 huérfanas conservadoras. ES/EN/PT/IT. |
| Tests del digest/contrato del roadmap | 44/44, exit 0. |
| Roadmap | Regenerado con el script canónico contra `origin/nightly`; sólo dos hitos manuales cambian. |
| Regresiones Go del motor reutilizado | PASS en la base ISA-1277 idéntica para Go: golden, ritmo efectivo, reservas y último piloto. No es prueba de la nueva UI. |
| Compilación Windows productiva | PASS con tag production y canal local nightly. No equivale a distribución, CI remota o promoción. |
| Runtime lector | Verificación SHA-256 PASS: manifest `700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`, 5 miembros; DuckDB v1.5.5. |
| Wails / Computer Use | La build arranca y expone `Vantare Hub`. Se captura la pantalla de inicio de sesión. Strategy no se ha podido recorrer: requiere intervención del usuario para autenticarse. |
| Paridad visual v5 / revisión adversarial >9/10 | PENDIENTE. No se hereda la puntuación A4 ni se sustituye por la aprobación del HTML. |

Logs locales del orquestador: `C:/tmp/isa1314-frontend-test.log`, `C:/tmp/isa1314-final-build.log`, `C:/tmp/isa1314-lint.log`, `C:/tmp/isa1314-i18n.log`. Los primeros checks del ejecutor sólo constan en sus herramientas; la repetición final conserva archivos para inspección.

## Revisión del diff

Se contrastaron menú, preparación, navegación, propietarios de sesión, cálculo, aceptación, payload, estilos y traducciones. Hallazgos corregidos con pruebas de comportamiento: discovery tras replay StrictMode; regreso al borrador; aplicación de dos fuentes; cambios A→Manual→B→A; limpieza del inspector al cerrar handles; Manual→telemetría sin origen contradictorio; nombre de archivo mediante identidad persistente distinta del handle; entrada directa a Plan sólo tras guardado confirmado. Se conservan validación, bloqueo durante operaciones y recuperación de comandos inciertos. La solución reutiliza componentes/servicios y evita un segundo solver, estado global o pipeline de lectura.

## Prueba nativa pendiente

Ejecutable: `C:/tmp/vantare-isa1314/vantare-v2/bin/vantare.exe`, compilado desde este worktree. PID inicial 21588. Directorio de trabajo `C:/tmp/vantare-isa1314/vantare-v2`. La configuración pública necesaria estaba presente en el entorno; se comprobó sólo su presencia, sin imprimir valores. No se leen `.env`, credenciales ni almacenes protegidos, ni se altera el acceso. El usuario debe iniciar sesión. LMU estaba en ejecución y no se inicia ni se cierra.

Después del acceso: abrir Estrategia; contrastar menú con v5; elegir Manual, cambiar combinación/reglas/pilotos y regresar al menú; volver al borrador; abrir biblioteca y una sesión estable; comprobar selección múltiple y revisión; guardar, ir a Plan, calcular y revisar stint/parada. Repetir anchuras/idiomas y registrar capturas antes de dar por cerrado el porte visual. El gate integral T22 y la validación empírica del SDD permanecen separados.

Antes de la revisión se registraron sólo hashes de dos originales candidatos (todavía no abiertos en esta build): COTA 3.010.560 bytes, `B6F8AFFFDF59066B13210499DA9B23524C8F72944B40F5193EFA96ACFAD60F34`; Imola 37.122.048 bytes, `719D438E745BD95F00A4A830F04683B3C2376E4D49B9C2929766B17BEBEB3E64`. No son prueba de lectura ni de cálculo.

## Estado Git y entrega

Commit de implementación `421ea6580a02ff7f09da8b6275062014e4805dc8`. Rama `vantareapp/isa-1314-strategy-menu-desk`; base `7ff79ead4c125d63730b0ec3aa181e6c630453ab` (ISA-1277). El checkout principal y los cambios ajenos de calendario permanecen intactos. Entrega local sin push, PR, CI remota, merge, promoción ni release. No se cierra la issue como integrada.

## Archivos

Se crean `StrategyRecordedPreparation.tsx`, sus estilos, los estilos del menú, este informe y el contrato de diseño. Se retiran `StrategyRecordedWizard.tsx`, su test de presentación y `strategy-recorded-choices.css`, sin consumidores. No se renombran los tipos de borrador persistido ni se eliminan sus validadores.

Archivos modificados o creados en el corte:

- `docs/strategy-planner/design/strategy-menu-desk-v5.md`
- `frontend/src/hub/strategy-orbit/StrategyRecordedPreparation.tsx`
- `frontend/src/hub/strategy-orbit/strategy-recorded-entry.css`
- `frontend/src/hub/strategy-orbit/strategy-recorded-preparation.css`
- `vantare-v2/docs/roadmap/plan.md`
- `vantare-v2/docs/roadmap/roadmap.json`
- `vantare-v2/docs/strategy-planner/sdd/README.md`
- `vantare-v2/docs/strategy-planner/sdd/acceptance.md`
- `vantare-v2/docs/strategy-planner/sdd/execution.md`
- `vantare-v2/docs/vantare-program/handoffs/strategy-planner.md`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedOverview.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedPage.test.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedPage.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedSessions.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedStart.test.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedStart.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedWizard.test.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedWizard.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedWorkflow.test.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/StrategyRecordedWorkflow.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/strategy-recorded-calculation.ts`
- `vantare-v2/frontend/src/hub/strategy-orbit/strategy-recorded-choices.css`
- `vantare-v2/frontend/src/hub/strategy-orbit/strategy-recorded-data.css`
- `vantare-v2/frontend/src/hub/strategy-orbit/strategy-recorded-frame.css`
- `vantare-v2/frontend/src/hub/strategy-orbit/strategy-recorded-overview.css`
- `vantare-v2/frontend/src/hub/strategy-orbit/strategy-recorded-page.css`
- `vantare-v2/frontend/src/hub/strategy-orbit/strategy-recorded-payload.test.ts`
- `vantare-v2/frontend/src/hub/strategy-orbit/strategy-recorded-payload.ts`
- `vantare-v2/frontend/src/hub/strategy-orbit/strategy-recorded-wizard.ts`
- `vantare-v2/frontend/src/hub/strategy-orbit/use-recorded-acceptance.test.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/use-recorded-acceptance.ts`
- `vantare-v2/frontend/src/hub/strategy-orbit/use-recorded-calculation.test.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/use-recorded-calculation.ts`
- `vantare-v2/frontend/src/hub/strategy-orbit/use-recorded-sessions.ts`
- `vantare-v2/frontend/src/hub/strategy-orbit/use-recorded-workflow.test.tsx`
- `vantare-v2/frontend/src/hub/strategy-orbit/use-recorded-workflow.ts`
- `vantare-v2/frontend/src/i18n/locales/strategy-orbit/en.ts`
- `vantare-v2/frontend/src/i18n/locales/strategy-orbit/es.ts`
- `vantare-v2/frontend/src/i18n/locales/strategy-orbit/it.ts`
- `vantare-v2/frontend/src/i18n/locales/strategy-orbit/pt.ts`
