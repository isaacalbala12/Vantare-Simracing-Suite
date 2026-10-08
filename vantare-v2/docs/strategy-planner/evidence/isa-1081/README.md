# ISA-1081 — comandos autorizados escalares

Base 89bdb65e; rama vantareapp/isa-1081-authorized-correction-commands;
worktree C:/tmp/vantare-isa1081. Cinco Go: servicio, preparación, comandos nuevos
y test, composición main. Raíz persistente data/telemetry-analysis/corrections.

Guardar/consultar/proyectar mantienen fuente autorizada, lifecycle y bloqueo de
sesión. Replay también revalida antes de consultar idempotencia. Resolución de
targets lineal sobre páginas acotadas; no se aceptan originales del cliente.
Errores públicos sanitizados distinguen conflicto, base cambiada, revisión
perdida, incertidumbre y custodia no disponible. Project exige ID explícito.

RED por API ausente; GREEN guardar, replay, cargar, proyectar, conflicto, base
cambiada, licencia revocada, fuente no disponible, raíz inválida y sanitización.
RED adicional: catálogo inicial sin vueltas derivadas hacía que la proyección
no anunciara familias utilizables. Adaptación desde vueltas completas reales
de la derivación corrige ambos sentidos: añadir datos utilizables y retirarlos
al corregir su tiempo a cero. No introduce umbral físico ni modifica raw.

Fixtures controladas de contrato/parser, no carrera real ni evidencia de precisión.
App/Analysis completos, vet, build y go test ./... pasan; log
C:/tmp/isa1081-go-test.log. Avisos heredados de chunks/timings en build.
TS/CSS intactos; no se repite su suite: último gate #1079 416/3264 con dos workers.
Revisión personal de los cinco archivos, locks, cancelación, fuente y datos.
Contrato, handoffs y roadmap manual/generado actualizados.

Faltan cliente nativo, selección persistida de revisiones, agregación de varias
sesiones desde esta vía, operaciones restantes, UI, calibración y Wails.
Sin nuevas dependencias, originales reales leídos/modificados, LMU, push/PR,
CI remota, merge, promoción o release.
