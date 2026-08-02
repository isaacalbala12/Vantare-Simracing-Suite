# Política de ejecución, ramas y promoción

Estado: decisión confirmada por Isaac el 2026-07-27.

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

Este es el flujo objetivo, no el estado físico actual. A 2026-07-27 existen
`develop` y `master`; `nightly` y `testers` aún no existen y los workflows de
Discord siguen ligados a `develop`.

Hasta ejecutar la migración:

- todo trabajo continúa apilado en ramas de issue;
- los PR quedan draft/sin merge;
- no se inventa un destino Nightly/Testers;
- `develop` solo describe integraciones históricas ya autorizadas;
- ISA-121 / REL-00 creará ramas, adaptará CI/webhooks/updater y probará rollback
  antes de habilitar promociones.

## Contrato por issue

- Una issue ejecutable equivale a rama, worktree y contexto propios.
- Se usa el nombre generado por Linear.
- Base exacta y destino constan en la issue.
- Commits pequeños y staging limitado.
- PR draft y `In Review` con evidencia; nunca merge implícito.
- La promoción utiliza issues de integración separadas.

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
