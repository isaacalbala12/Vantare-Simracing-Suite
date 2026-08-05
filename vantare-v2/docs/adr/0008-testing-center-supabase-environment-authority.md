# ADR 0008: Supabase principal como autoridad del Testing Center

- Estado: aceptado para planificación; despliegue todavía no autorizado.
- Fecha: 2026-08-05.
- Issue: ISA-292 / TAU-07L.
- Base documentada: `nightly@41e62a5b5914526e01d6ec402a9c5d58ed2d3c2a`.
- Relacionado: ADR 0007, que mantiene Linear como proyección operativa.

## Contexto

El piloto TAU-07 demostró en un proyecto Supabase de testing que Vantare puede
crear una única proyección sanitizada en Linear, recibir un webhook firmado y
deduplicar reportes. PR #121 integró el stack local en Nightly, pero no desplegó
Testing Center en el Supabase principal.

Vantare dispone de tres proyectos con funciones diferentes:

| Entorno | Project ref | Uso decidido |
| --- | --- | --- |
| principal | `ombjshwzqgeisazijduq` | Auth, usuarios, licencias y futuro Testing Center canónico |
| staging | `rilwmlbnucbbayaulnxw` | ensayo destructible previo a producción |
| piloto histórico | `lbaxvpzexoferfvfkplz` | evidencia TAU-07I; queda congelado |

Mantener Testing Center permanentemente en `lbax` exigiría intercambiar y
validar identidad entre dos proyectos Supabase, duplicaría autoridades y
añadiría un backend intermedio. Copiar directamente el piloto al principal
también sería inseguro: el historial remoto de migraciones no coincide con los
timestamps locales y el piloto contiene tooling, nombres y secrets específicos.

El backup lógico del principal está generado y sus checksums fueron verificados,
pero todavía no ha superado una restauración completa. Incluye datos sensibles
de Auth y sesiones, por lo que nunca puede entrar en Git, logs, Linear o
artefactos de CI.

## Decisión

### Autoridades

1. `ombjshwzqgeisazijduq` será la única autoridad remota de Auth, usuarios,
   licencias, acceso de canal y estado canónico de Testing Center.
2. `rilwmlbnucbbayaulnxw` será el único entorno previo para probar migraciones,
   RLS, eliminación de cuentas, builds y funciones antes de producción.
3. `lbaxvpzexoferfvfkplz` queda congelado como piloto histórico. No recibirá
   `db push` desde mainline ni se usará como fuente de producción.
4. Supabase conserva reportes, ocurrencias, candidatas, votos, pausas, outbox,
   retención y auditoría. Linear sigue siendo una proyección sanitizada. GitHub
   conserva únicamente código, ramas, PR y CI.
5. Codex recibe un handoff humano y determinista. Ningún webhook, comentario,
   assignee, rechazo o timeout concede autoridad para ejecutar código.

### Acceso

Una operación de Testing Center solo se autoriza server-side cuando cumple a
la vez:

```text
membresía Testing Center activa
AND
entitlement o acceso operativo vigente al canal real
```

La capability del cliente ayuda a ocultar o mostrar UI, pero no es autoridad.
El backend debe consultar la misma fuente canónica usada por
`license-credential`, incluyendo suscripciones y accesos operativos revocables.

### Datos y borrado de cuentas

- Membresías y claves idempotentes personales pueden desaparecer con la cuenta.
- Reportes, votos, eventos y auditoría se conservan anonimizados mientras la
  issue esté abierta y durante la ventana de retención aprobada.
- La anonimización elimina el UUID del usuario, conserva un actor opaco y el rol
  histórico, y trata el texto libre como posible PII.
- Evidencia PostHog se purga al revocar consentimiento o borrar la cuenta.
- Una fecha `expires_at` no cuenta como borrado: debe existir una purga ejecutable,
  auditable y probada.

### Migraciones

El historial remoto del principal es autoridad de versiones ya aplicadas. El
SQL local de `operational_access_assignments` debe conservar el contenido
verificado pero alinearse con la versión remota
`20260803141908_operational_access_assignments`.

El bundle Testing Center se reasignará a un rango nuevo y consecutivo,
preservando el orden de dependencias. Antes de modificar archivos se generará
un manifiesto antiguo→nuevo con hashes y SHA Git del piloto.

Quedan prohibidos para esta reconciliación:

- `supabase db push --include-all`;
- `supabase migration repair`;
- `supabase db pull` como solución automática;
- SQL manual en staging o producción;
- migraciones down/reset sobre entornos remotos;
- renumerar sin manifiesto y sin prueba de instalación limpia y upgrade.

### Activación y contención

Schema, funciones y efectos se activan en cortes separados. Toda tabla nueva
nace inerte y la pausa global debe comprobarse inmediatamente antes de cada
efecto externo.

El apagado de UI, la pausa, la retirada de memberships y la revocación de
secrets nuevos constituyen **contención**, no restauración de base de datos. Los
errores de schema se corrigen con migraciones forward. Un restore completo se
reserva para corrupción y exige una ventana humana explícita.

## Alternativas descartadas

### Mantener Testing Center en `lbax`

Mejor aislamiento inicial, pero crea dos autoridades de identidad y exige un
servicio de intercambio de tokens. Complejidad desproporcionada para una sola
persona y una aplicación todavía en testing.

### Desplegar directamente en producción

Reduce pasos, pero combina deriva de migraciones, Auth real y tooling de piloto
sin demostrar restauración. Rechazado.

### Squashear todo el piloto

Reduce archivos, pero elimina trazabilidad con los tests, commits y evidencia
existentes. Se preservan los cortes y se renumeran mecánicamente bajo manifiesto.

### Crear ahora un schema PostgreSQL separado

Aísla nombres, pero obliga a reescribir RPC, PostgREST, funciones, tests y
grants. Para el MVP se mantiene `public.testing_center_*`, RLS forzada y grants
cerrados. Un cambio de schema requeriría otra ADR.

### Automatizar Linear → Codex → PR sin propietario

No es fiable frente a rama/base ambigua, prompt injection, retries o resultados
inciertos. Se mantiene handoff humano, preflight por SHA y revisión de PR.

## Consecuencias

- El MVP reutiliza Auth y licencias reales sin duplicar identidad.
- El despliegue necesita más gates, pero cada riesgo se prueba antes de tocar
  producción.
- Staging requiere builds explícitas y secrets propios; nunca reutiliza secrets
  de producción.
- PostHog, Discord y Codex automático quedan fuera del primer rollout.
- El plan operativo obligatorio es
  `docs/superpowers/plans/2026-08-05-testing-center-primary-supabase-rollout.md`.

## Criterio para revisar esta ADR

Revisar si Vantare separa cuentas por región/tenant, si Supabase deja de ser la
autoridad de Auth, si el volumen exige otro backend o si se propone automatizar
Codex sin gate humano.
