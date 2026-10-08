# Política de ejecución, ramas y promoción

> **Seguimiento vigente (#1503): GitHub Issues de este repositorio y GitHub
> Project Vantare.** Leer la issue y actualizarla junto con el handoff tras
> cada cambio material; registrar PR, checks, SHA y canal real. Los enlaces y
> estados de trackers anteriores son evidencia histórica, no instrucciones.


Estado: vigente, actualizado el 2026-08-05 tras ISA-121.

## Flujo

```text
rama de issue
  ↓ implementación, tests y review
aprobación inicial explícita de Isaac
  ↓
nightly
  ↓ feedback Pro Plus y correcciones
testers
  ↓ prueba amplia y correcciones
aprobación final explícita de Isaac
  ↓
master
```

ISA-121 materializo `nightly` y `testers`. El checkout principal de ejecucion
debe seguir `nightly`, pero el trabajo se implementa siempre en una rama y
worktree de issue. `develop` y `refactor` son referencias historicas: no
reciben promociones nuevas y sus cambios locales no se limpian ni reutilizan.

## Contrato por issue GitHub

- Una issue GitHub ejecutable equivale a rama, worktree y contexto propios.
- Leer la issue y su proyecto antes de trabajar. Usar `vantareapp/isa-N-slug`
  con el número GitHub; conservar títulos e IDs históricos de issues migradas.
  Organizar con `area:*`, `state:*`, milestones y GitHub Project Vantare.
- Base exacta y destino constan en GitHub Issues junto con la referencia técnica.
- Commits pequeños y staging limitado.
- PR draft y Estado GitHub Issues `En revisión` con evidencia; nunca merge implícito.
- La promoción utiliza issues GitHub de integración separadas con evidencia de CI.
- Cada proyecto tiene un único handoff vivo y se actualiza tras cada worker,
  decisión o cambio material. La continuidad operativa y el estado se actualizan
  y releen en GitHub Issues al empezar, bloquear, entregar y verificar merge; el
  handoff Git conserva evidencia técnica enlazada. Los cambios de alcance y
  plan futuro se registran en GitHub Issues. Isaac indica a Codex los cambios del roadmap
  compartido en Supabase; la app solo lee (`../roadmap-maintenance.md`).

## Delegacion y responsabilidad

- El orquestador puede delegar cortes acotados y sigue siendo responsable de
  revisar diff, checks, riesgos y entrega.
- Un worker no crea subagentes salvo autorizacion expresa y acotada.
- No se comparten worktrees o ramas entre agentes concurrentes.
- La ejecucion directa es preferible para trabajo trivial cuando evita coste y
  coordinacion innecesarios.

## Autonomía

Los agentes pueden crear/actualizar issues, ramas, worktrees, commits, pushes,
PRs draft, investigación, reviews y fixes dentro de la issue aprobada. Si falla
el acceso al tracker, conservar evidencia y comunicar el bloqueo; no dar el
seguimiento por cerrado sin verificar la escritura.

Una simplificación arquitectónica o retirada de código se ejecuta solo cuando:

- la issue GitHub/plan la incluye o se crea una tarea propia;
- no contradice decisiones;
- hay consumidores cero o contrato de migración;
- existen characterization/tests y rollback;
- pasa review independiente.

Requieren a Isaac:

- aprobación antes de Nightly;
- aprobación antes de Master;
- release o anuncio comercial;
- pagos/refunds/gasto;
- borrado masivo irreversible;
- exposición/rotación de secretos;
- eliminación de cuentas/datos reales.

La promocion a `nightly` y la promocion final a `master` son autorizaciones
distintas. La primera valida una implementacion inicial; la segunda valida el
producto corregido tras Nightly y Testers.

El desarrollo puede continuar apilado hasta completar un módulo, pero no se
promociona a Nightly sin aprobación inicial.

## Preautorización inerte de la rama automática (ISA-318)

La corrección automática del Testing Center usa únicamente
`vantareapp/tc-<12 hex minúsculas>-<slug seguro>[-revert]` y solo como PR a
`nightly`. La rama automática nunca se dirige a `testers`/`master` ni hace push
directo, y ninguna ruleset ni auto-merge se habilita sin autorización expresa
de Isaac.

- La ruta permanece inerte: la CLI actual no acepta JSON arbitrario y rechaza
  una rama `tc-*` sin atestación confiable. ISA-322 debe verificar
  criptográficamente su procedencia antes de pasar los claims al validador;
  un marcador dentro del payload no concede autoridad.
- `docs/branch-channels.md` fija los claims, checks y pruebas de frescura
  exactos que deben cumplirse antes de cualquier activación.
- Cualquier efecto es revocable mediante kill switch antes de cada paso.
- Excluidas de la preautorización: workflows, schema, auth, billing, secretos,
  dependencias, datos, release y gasto.
- El bootstrap de workflows permanece humano e inerte hasta `master` y no
  configura credenciales, dispatch ni ruleset.

## Stop conditions

Para el bucle experimental de Telemetría V2 rige el límite específico aprobado
del [maestro 2026-09-03](../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md):
cinco experimentos consecutivos sin mejora medida u ocho horas de ejecución,
lo primero. Sustituye sólo el contador genérico de enfoques; mantiene los demás
stops de seguridad/autoridad y no autoriza sesiones LMU ni automatizaciones.

- Tres enfoques razonables fallan.
- Sesenta minutos sin nueva evidencia.
- Hay que contradecir una decisión.
- No se puede verificar.
- Riesgo de datos, dinero, secretos o destrucción.
- Dependencia nueva no aprobada.
- Base sucia o trabajo ajeno en conflicto.
- Documentos vigentes contradictorios.

## Review y entrega

El reviewer es independiente y no edita durante la revisión. Busca corrección,
alcance, simplicidad, seguridad, rendimiento, tests complacientes, código
muerto, contratos, privacidad y rollback.

La entrega enumera base/rama/SHA, archivos, checks, omisiones, capturas/datos,
rendimiento, riesgos, rollback, siguiente issue GitHub, commit/push/PR y nivel
de promoción alcanzado.

Una tarea terminada en rama queda `En revisión` en GitHub Issues. Solo queda `Aceptada`
cuando cumple los criterios y la aceptación aplicable; registrar por separado
el SHA y canal realmente verificados. Una tarea `Cerrada` sin entrega debe
explicar cancelación o sustitución; no presentarla como completada. Master siempre requiere
Isaac.

`Aceptada` no equivale por si mismo a release publicada. Una publicacion requiere
tag, artefactos, checksums, workflow y estado remoto verificados.
