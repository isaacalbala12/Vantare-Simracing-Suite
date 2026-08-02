# Política de ejecución, ramas y promoción

Estado: decisión confirmada por Isaac el 2026-07-27 y materializada por ISA-121;
reconciliación documental 2026-08-02.

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

ISA-121 materializó `nightly` y `testers`, adaptó los gates de promoción y dejó
`develop` congelada como referencia histórica. El estado físico vigente es:

- todo trabajo nace en una rama de issue y permanece draft/sin merge hasta su
  gate humano;
- los PR de issue apuntan a `nightly`;
- `nightly -> testers` y `testers -> master` se ejecutan mediante issues/PR de
  promoción separados;
- CI rechaza rutas distintas y los anuncios de beta amplia solo salen desde
  `testers`;
- las builds internas no equivalen a una release pública y el acceso efectivo
  continúa dependiendo del entitlement firmado;
- `develop` no recibe nuevas integraciones.

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
