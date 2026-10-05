# Handoff vivo — Testing Center

> **Seguimiento obligatorio en [Notion](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192).**
> Abrir tarea y proyecto antes de ejecutar; actualizar y releer al empezar,
> bloquear, entregar y verificar merge. [Contrato](../notion-transition.md).
> Este handoff conserva evidencia técnica fechada; sus estados antiguos no
> sustituyen el estado vivo ni autorizan nuevas tareas. Enlazar las nuevas entradas a Notion.


Última actualización: 2026-09-10, ISA-728 integrada en Nightly, Codex con verificación de Muse Spark 1.3 Contributor.

## Autoridad y alcance

Testing Center mantiene su proyecto separado de los módulos de producto.
GitHub Issues contiene el estado operativo; `../execution-policy.md`,
`../../branch-channels.md` y `../../../AGENTS.md` fijan las autorizaciones.
ISA-318 y ISA-322 corresponden a las issues migradas [#607](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/607)
y [#611](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/611).

## ISA-728 — validación del workflow inerte

- Base: `nightly` en `a9b8dd3695c66856e931d73650d54c4f6cb9e828`.
- Rama: `vantareapp/isa-728-inert-workflow-validation`.
- Código corregido: `5798d5eb4d7752d79c1708480266b6689b415ff2`.
- Worktree: `C:/tmp/vantare-isa728`; Muse usa otro worktree para verificar.
- Estado: integrada en `nightly` mediante la PR [#1108](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1108).
  SHA de integración de código: `a2958ea1c26e4e74dbaad3827382c36cb8d7de37`.
- Corrección, regresión y revisión independiente aprobadas. SHA publicado,
  PR y resultados remotos se registran en
  [#728](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/728).
- Sin promoción a Testers o Master ni release. Este corte es independiente del
  candidato de widgets #1098 / PR #1107.

GitHub rechazaba el workflow antes de crear trabajos. La [anotación del run](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/34500227769)
identifica `runner.temp` en las líneas 156 y 219: ese contexto no está
disponible en `jobs.<job_id>.env`, incluso si el trabajo está desactivado.
Las dos declaraciones de `MANIFEST_PATH` pasan al entorno de los cinco pasos
que consumen el manifiesto, conservando su ruta bajo la carpeta temporal del
ejecutor. La [tabla de contextos de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)
admite `runner` en `steps.env`.

## Evidencia y límites

- Muse confirmó el fallo estructural y que el contrato anterior pasaba sus
  14 pruebas sin detectarlo. Logs locales en su `.task/isa-728-evidence/`.
- La nueva regresión falla con el workflow original; el candidato pasa las
  15 pruebas Deno, formato y `git diff --check`.
- Muse revisó `5798d5eb`: APROBADO, sin hallazgos P0, P1 o P2, y confirmó las
  15 pruebas. Codex revisa los cambios documentales posteriores; el código
  permanece idéntico al SHA revisado.
- Comprobación local con PyYAML ya instalado: YAML válido y los cinco
  consumidores conservan la misma variable en el entorno de su paso. Esto no
  sustituye al validador remoto de GitHub Actions.
- Evidencia local de implementación en `vantare-v2/.task/isa-728-evidence/`.
- No hay cambios de Go, frontend o contratos de telemetría; no se repiten sus
  suites locales para este arreglo. Los gates oficiales se verifican en la PR.

## Decisiones y siguiente acción

Se conservan los dos disparadores, la fixture manual `small-frontend-bug`,
permisos de lectura, acciones fijadas por SHA y todos los trabajos productivos
desactivados. No se configura ningún proveedor, secreto, ruleset ni auto-merge.

La integración de Nightly quedó registrada con el merge de la PR #1108 y el
SHA `a2958ea1`. El resultado del CI postmerge y la punta vigente se cierran en
la issue de integración [#1109](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1109).
La siguiente promoción a Testers requiere feedback Pro Plus y la aprobación
reservada a Isaac.
No reenviar eventos
`repository_dispatch` ni activar correcciones automáticas.
## Beta nativa #1456 — Admin compatible con native-admin (2026-10-05)

Rama aislada `vantareapp/isa-1453-posthog-admin`, base `a464e9fc`.
Cliente adaptado al servidor versionado en `supabase/functions/native-admin`
y `20261003201000_native_admin.sql`: capacidades `vantare.module.*`, contactos
nullable, búsqueda no vacía, `next_cursor`, texto de payload y objetos de URLs
firmadas. Sin `VANTARE_ADMIN_URL`, deriva la ruta exacta del origen Supabase.
La búsqueda inicial pide introducir correo/nombre, sin enviar una query vacía.
El servidor devuelve módulos efectivos, no concesiones individuales: la UI
muestra ese acceso y permite Conceder/Revocar explícitamente; revocar no elimina
acceso por rol o rollout. Confirmación y relectura tras ACK se conservan.
No se cambia servidor ni se despliega. E2E owner pendiente: el orquestador
confirmó owner activo de Isaac (nota 15:04); Isaac inicia sesión en raíz aislada; no usar tokens de
native-beta. Escrituras solo cuenta propia y restaurando el estado, sin rollout
global. Guía y checklist en `C:/tmp/mac-evidence/`.
Gates completos Unix presentan fallos ajenos en UI; resultados propios y logs
se reportan sin declarar verde el workspace. No se crea PR ni se promociona.

Actualización #1456 (nota 15:24): instalación privada reproducible mediante native/admin/instalar-escritorio.ps1, en LOCALAPPDATA/Vantare Admin; accesos Escritorio/Inicio con icono y lanzador sin consola, sesión aislada y reinstalación conservando datos. Instalación 2x y arranque desde el acceso verificados. Binario Windows perfil prueba con config real OK; capturas físicas demo limpias de las tres pantallas revisadas (1280x800, DPI96), beta sin cambios. Mac: fmt y Clippy propios --no-deps OK; 69 tests propios y 10 lifecycle OK. E2E owner producción continúa pendiente del login de Isaac.

## Ronda 2 Admin #1456 — servidor listo para revisión (2026-10-05)

La búsqueda real por nombre y correo de Isaac devuelve una cuenta owner. La
lista inicial vacía era el flujo de búsqueda obligatoria; Isaac pide listado
paginado al abrir. `search_accounts` con query vacía y cursor UUID lista solo
cuentas ya mapeadas al issuer, ordenadas por alta/UUID descendentes. La migración
20261005160000 precede al despliegue Edge. No se crean identidades objetivo.
El perfil actor validado se reutiliza en enriquecimiento; bloqueo, owner,
revocación OAuth, presupuesto y auditoría siguen comprobándose en cada petición.
Logs sanitizados separan las fases del servidor. No hay caché de autenticación.
Dos regresiones fallaron antes; después Deno Admin/authorize 70/70 y lint/fmt OK.
Tests pgTAP de páginas añadidos; NO ejecutados: sin PostgreSQL/Docker local.
Evidencia: C:/tmp/mac-evidence/r2-server-*.log. Despliegue y verificación de fases
pendientes del orquestador; cliente de caché/debounce/listado todavía en curso.
Sin push, PR, integración o release. plan.md no existe en la base recibida.
