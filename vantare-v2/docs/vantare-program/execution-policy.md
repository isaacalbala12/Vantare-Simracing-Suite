# Política de ejecución, ramas y promoción

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

## Contrato por issue

- Una issue ejecutable equivale a rama, worktree y contexto propios.
- Se usa el nombre generado por Linear.
- Base exacta y destino constan en la issue.
- El agente completa el sobre de tarea definido en `source-ownership.md` y
  contrasta el estado esperado de Linear con el observado en Git.
- Commits pequeños y staging limitado.
- PR draft y `In Review` con evidencia; nunca merge implícito.
- La promoción utiliza issues de integración separadas.
- Cada proyecto tiene un unico handoff vivo para continuidad tecnica. Linear se
  actualiza tras cada cambio material; el handoff cambia solo si hay nueva
  arquitectura, decision, evidencia, riesgo o siguiente accion tecnica.

## Delegacion y responsabilidad

- El orquestador puede delegar cortes acotados y sigue siendo responsable de
  revisar diff, checks, riesgos y entrega.
- Un worker no crea subagentes salvo autorizacion expresa y acotada.
- No se comparten worktrees o ramas entre agentes concurrentes.
- La ejecucion directa es preferible para trabajo trivial cuando evita coste y
  coordinacion innecesarios.

## Autonomía

Los agentes pueden crear/actualizar Linear, ramas, worktrees, commits, pushes,
PRs, CI, investigación, reviews y fixes dentro de la issue activa.

Una simplificación arquitectónica o retirada de código se ejecuta solo cuando:

- la issue/plan la incluye o se crea una issue propia;
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

## Stop conditions

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
rendimiento, riesgos, rollback, siguiente issue, commit/push/PR, Linear y nivel
de promoción alcanzado.

Una issue terminada en rama queda `In Review`. Solo queda `Done` cuando cumple
criterios y está integrada en el nivel autorizado. Master siempre requiere
Isaac.

`Done` no equivale por si mismo a release publicada. Una publicacion requiere
tag, artefactos, checksums, workflow y estado remoto verificados.
