# ISA-1029 — conservación del horario

Base: nightly d6d0992f8dbc800ccb6d75f60fffdc7c3d561da2. Rama:
vantareapp/isa-1029-calendar-retention. Primer corte C0/C2 del plan aprobado #1027.

## Cambio

Las inicializaciones legacy/semanal conservan series ya guardadas. Refresh mantiene
el último documento si falla red o no hay publicación; publicaciones anteriores
o futuras mientras sigue vigente la actual no sustituyen el horario. Calendar
persiste vigencia, fuente y fecha del documento sin duplicar las series. La
aplicación de un horario restaura memoria previa si falla la escritura atómica.
Lectores antiguos pueden ignorar el metadato aditivo; no se elimina Events.

## Evidencia

Antes: 5 escenarios de pérdida reproducidos (error, remoto vacío, anterior,
futuro, reinicio), más pérdida de metadatos y mutación pese a fallo de escritura.
Después: regresiones y `go test ./internal/calendar/...` PASS.
`pnpm --dir frontend build` PASS para el embed (aviso heredado de chunk >500 kB).
`go test ./...` PASS. Roadmap digest 23 tests y contrato 21 tests PASS.
`git diff --check` PASS. Logs locales ignorados: results/isa1029/.

No cambios frontend: no se repitieron suite/lint frontend. El build sí comprueba
tipos. Wails real, aviso Windows, rendimiento A/B y review independiente pendientes
al preparar este informe. El siguiente corte propaga vigencia al store y vistas;
este commit no declara arreglados F1/F2/F4–F8 de la auditoría.

## Revisión independiente

La primera revisión de 90a48d76 pidió corregir dos P2: respuesta vieja de la misma
semana y publicación futura sobre un archivo legacy sin metadatos. Ambos casos
se reprodujeron RED y se corrigieron GREEN usando PublishedAt del servidor y
conservando series legacy ante un candidato que todavía no comienza.
El módulo Calendar y `go test ./...` vuelven a pasar. Revisión independiente
final de 01a6b613: ACCEPT acotado a C2, sin P1/P2 nuevos. No certifica Wails ni C3–C11.

## Verificación y reversión

Regresión ejecutable: `go test ./internal/calendar -run
'TestPublishedScheduleSurvives|TestScheduleMetadata|TestScheduleWriteFailure' -count=1`.
En perfil Wails de prueba: cargar publicación vigente, seguir serie, reiniciar
offline y comprobar mismo horario/seguimiento; no hacerlo con datos personales.
Revertir el corte conserva el formato anterior (los campos nuevos son aditivos),
pero reintroduce el comportamiento defectuoso de arranque/refresh.

Cambios: cuatro archivos Go productivos (main solo comentarios), regresiones,
plan aprobado, este informe, handoff único y roadmap manual/generado.
Sin cambios HUD/OBS/Studio, secretos, dependencia, merge o release.
Commit/PR/CI finales se registran en #1029; local PASS no implica integración.
