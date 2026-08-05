# Testing Center en Supabase principal — plan maestro de rollout seguro

Fecha: 2026-08-05

Estado: aprobado para documentación y preparación local; staging y producción
siguen en NO-GO.

Issue de este documento: ISA-292 / TAU-07L.

Base inicial: `nightly@41e62a5b5914526e01d6ec402a9c5d58ed2d3c2a`.

Destino de la PR documental: `nightly`.

Este plan sucede al plan TAU-07 del 2026-08-03 únicamente para reconciliar
entornos y desplegar el stack ya integrado. No reabre sus contratos ni autoriza
efectos externos.

## 1. Objetivo

Llevar de forma controlada el Testing Center integrado en Nightly al Supabase
principal de Vantare, demostrando antes:

- recuperación real del backup;
- historial de migraciones determinista;
- borrado o anonimización segura de cuentas;
- doble autorización server-side de membership y canal;
- RLS, grants y deduplicación;
- separación inequívoca entre staging y producción;
- activación manual, observable y reversible de Linear.

La entrega inicial termina con un primary tester capaz de enviar y validar un
reporte sintético. PostHog, Discord y automatización Codex se planifican después
en issues separadas.

## 2. Fuentes de verdad y estado inicial

| Superficie | Autoridad |
| --- | --- |
| Auth, usuarios, licencias y canal | Supabase principal `ombjshwzqgeisazijduq` |
| Ensayo previo | Supabase staging `rilwmlbnucbbayaulnxw` |
| Evidencia histórica | piloto congelado `lbaxvpzexoferfvfkplz` |
| Reportes, votos, outbox y pausas | Supabase principal |
| Operación de Isaac | Linear, como proyección sanitizada |
| Código, PR y CI | GitHub |
| Análisis/corrección | Codex mediante handoff humano por SHA |
| Comunicación | Discord, solo estados sanitizados y en corte posterior |

Evidencia disponible al abrir ISA-292:

- PR #121 fusionada en `nightly@41e62a5`.
- Piloto `lbax`: round-trip Linear, webhook y deduplicación demostrados.
- Backup lógico del principal generado y verificado por checksum.
- Backup todavía no restaurado; no cuenta como recuperable.
- Producción registra `20260803141908_operational_access_assignments`.
- El repo conserva SQL equivalente en
  `20260803140000_operational_access_assignments.sql`.
- Las migraciones Testing Center locales son anteriores o dependientes de
  versiones que producción ya considera aplicadas.
- Tooling y worker actuales contienen identidad específica del piloto.
- La pausa global está activa en el piloto; esto no demuestra el estado del
  principal.

## 3. Invariantes

1. Una issue ejecutable equivale a una rama, un worktree y un contexto Codex.
2. El checkout compartido sucio no se usa para esta iniciativa.
3. Ningún corte mezcla documentación, schema, funciones y activación externa.
4. Staging siempre precede a producción.
5. No se imprimen ni documentan secretos, filas Auth, sesiones, tokens, dumps o
   texto real de testers.
6. No se usan secrets de producción en staging.
7. No se ejecutan `--include-all`, `migration repair`, `db pull`, SQL manual ni
   down/reset remotos.
8. Migración antes que Edge Function; schema inerte antes que red.
9. Membership activa no basta: cada RPC/Edge exige también acceso vigente al
   canal consultado server-side.
10. Un SHA nuevo es un candidato nuevo y no hereda votos.
11. Un primary tester puede aprobar funcionalmente Nightly; Isaac autoriza las
    promociones.
12. Un rechazo o resultado ambiguo termina en `needs_owner`, sin retry.
13. PostHog, Discord y Codex automático permanecen apagados hasta issues propias.
14. Los errores remotos se corrigen con migraciones forward. El backup es
    recuperación de emergencia, no rollback rápido.

## 4. Arquitectura objetivo del primer rollout

```text
Tester Nightly
  -> formulario y validación in-app
  -> RPC/Edge autenticado
  -> membership activa + canal vigente
  -> Supabase principal (estado canónico, pausa, outbox)
  -> Linear sanitizado, activado manualmente
  -> Isaac prepara handoff determinista
  -> Codex analiza y abre PR
  -> revisión humana
  -> nightly -> testers -> master
```

Linear no recibe logs completos, dumps, tokens, URLs privadas de replay,
assignee automático, prioridad automática ni instrucciones procedentes del
tester. GitHub Issues no se reactiva como fallback.

## 5. Política de datos

| Dato | Al borrar la cuenta | Retención inicial |
| --- | --- | --- |
| membership | `CASCADE` | ninguna |
| idempotencia personal | `CASCADE` | ninguna |
| reporte/ocurrencia | anonimizar actor; conservar evidencia | issue abierta + ventana aprobada |
| voto/decisión/auditoría | `SET NULL` + actor opaco + rol histórico | 24 meses o política posterior |
| texto libre | redactar o purgar según cierre; asumir PII | nunca indefinida |
| consentimiento PostHog | purga explícita | máximo 30 días |
| replay PostHog | purga explícita al revocar/borrar | máximo 7 días |
| dossier Codex | conservar digest; purgar cuerpo | cierre + 30 días |
| Linear sanitizado | archivar/purgar por política operativa | hasta cierre |

`expires_at` solo expresa intención. La retención no está cumplida hasta que una
purga ejecutable pase pruebas y deje auditoría agregada sin PII.

## 6. Estrategia de migraciones

### 6.1 Manifiesto obligatorio

Antes de renombrar se genera un documento mecánico con:

- nombre y versión histórica;
- nombre y versión nueva;
- SHA-256 antes y después;
- razón del cambio;
- dependencias;
- commit Nightly de origen;
- marca `piloto congelado` para `lbax`.

### 6.2 Regla de orden

1. Alinear `operational_access_assignments` con la versión remota
   `20260803141908`, conservando el SQL verificado.
2. Reservar un rango nuevo posterior al máximo remoto para todo Testing Center.
3. Conservar el orden actual: core → access → submission → triage → GitHub
   legacy → Codex control → Linear outbox → webhook → candidate feedback →
   PostHog privacy → worker neutral → compatibilidad UUID.
4. Sustituir el corte `testing_center_linear_pilot` por una migración neutral de
   entorno; no copiar identidad ISA-243 a producción.
5. Añadir después migraciones forward de hardening. No editar migraciones ya
   aplicadas tras publicar el nuevo historial.

### 6.3 Gates

- versiones únicas y estrictamente ordenadas;
- clean install completo;
- upgrade desde baseline de producción y staging;
- rollback local de harness y reaplicación;
- dos workers concurrentes conservan exactly-once;
- dry-run remoto enumera exclusivamente el bundle aprobado;
- cero cambios inesperados en Billing/Auth;
- hashes del SQL operativo coinciden con el manifiesto.

## 7. Microcortes ejecutables

Cada corte necesita una issue Linear propia antes de editar. Los nombres
`TC-SUP-*` son IDs del plan, no números Linear reservados.

### TC-SUP-00 — Estado vivo y ADR

- Tipo: documentación.
- Issue: ISA-292.
- Alcance: ADR 0008, este plan, `current-plan`, handoff y enlace desde el plan
  TAU-07 histórico.
- No tocar: código, SQL, funciones, workflows, Supabase remoto o secrets.
- Checks: enlaces, búsqueda de contradicciones, `git diff --check`.
- Cierre: PR documental a Nightly, sin merge automático.

### TC-SUP-01 — Protección y restore drill del backup

- Tipo: seguridad y recuperación; riesgo alto.
- Dependencia: TC-SUP-00.
- Objetivo: demostrar que el backup actual puede restaurarse.
- Acciones:
  1. confirmar BitLocker o cifrar el directorio del backup;
  2. ejecutar un restore aislado con imagen PostgreSQL compatible con Supabase,
     roles/extensiones correctos y recursos limitados; el runner PostgreSQL
     genérico existente es un gate útil, pero no sustituye este drill;
  3. identificar el formato sin imprimir contenido y restaurar roles, schema y
     datos en ese orden. Para SQL plano usar `psql -v ON_ERROR_STOP=1`; para un
     archivo custom/tar usar `pg_restore --exit-on-error`;
  4. usar parada inmediata ante error y salida sin filas;
  5. verificar conteos agregados, ocho usuarios Auth, schema, funciones,
     índices, RLS, historial y Storage vacío;
  6. smoke de Auth/licencias con cuenta sintética;
  7. destruir el destino temporal y registrar solo métricas sanitizadas.
- Checks: restore con modo estricto correspondiente al formato, pruebas
  negativas de dump truncado y cabecera corrupta, pgTAP y checksum.
- Stop: cualquier error de restore, rol/extensión faltante, PII en salida o
  necesidad de tocar producción.
- Gate humano: Isaac confirma protección del backup y acepta la evidencia.

Estado ISA-293, 2026-08-05: `NO-GO`. EFS, PFX y checksums quedaron verificados,
pero el primer restore demostró que el paquete no incluye el baseline gestionado
completo. `schema.sql` reconstruye `public`; `data.sql` depende también de las
estructuras Auth/Storage creadas por los servicios Supabase. El fallo ocurrió en
schema antes de datos, se revirtió y el destino efímero se destruyó. El retry no
puede crear namespaces/tablas ad hoc ni reutilizar el stack activo. Requiere una
ventana aprobada para generar un baseline vacío con Supabase CLI fijado, añadirlo
cifrado y por checksum al paquete y repetir todos los gates. Evidencia:
`docs/evidence/isa-293-supabase-primary-backup-restore-drill.md`.

### TC-SUP-02 — Manifiesto y reconciliación de historial

- Tipo: tooling/migraciones; riesgo alto.
- Dependencia: TC-SUP-01 verde.
- Objetivo: preparar la renumeración sin aplicarla remotamente.
- Acciones: capturar `migration list` de ambos entornos, generar manifiesto,
  alinear la versión operativa y reasignar todo el bundle Testing Center.
- Tests: hashes, versiones únicas, orden de dependencias, instalación limpia y
  upgrade desde snapshots sanitizados.
- Stop: versión remota desconocida, SQL operativo distinto, necesidad de
  `repair/include-all` o migración que toque Billing/Auth fuera de contrato.
- Gate: revisión xhigh independiente del diff SQL y del manifiesto.

### TC-SUP-03 — FKs, anonimización y borrado de cuenta

- Tipo: schema/test; riesgo alto.
- Dependencia: TC-SUP-02.
- Objetivo: eliminar `ON DELETE RESTRICT` incompatibles sin perder auditoría.
- Acciones: aplicar la matriz de datos de la sección 5 mediante migración
  forward; añadir actor opaco y rol histórico donde falten; preservar checks de
  autorización Linear; definir redacción de texto libre.
- Tests: crear usuario sintético, poblar todas las tablas Testing Center,
  eliminarlo y demostrar cero restricciones, cero UUID residual y cero
  evidencia PostHog privada.
- Stop: se necesita borrar datos Billing, relajar RLS o conservar PII sin TTL.

### TC-SUP-04 — Doble gate de autorización

- Tipo: backend/schema; riesgo alto.
- Dependencia: TC-SUP-03.
- Objetivo: exigir membership funcional y acceso vigente al canal en cada
  operación server-side.
- Alcance: RPC, Edge `testing-center-feedback`, submission y decisiones.
- Tests negativos: membership sin entitlement, entitlement expirado,
  capability cliente falsificada, master, canal desconocido y rol incorrecto.
- Gate: todos fallan cerrados; una identidad válida funciona sin duplicar
  fuente comercial.

### TC-SUP-05 — Tooling cerrado por entorno

- Tipo: tooling.
- Dependencia: TC-SUP-02; puede prepararse en paralelo con TC-SUP-03/04 en rama
  separada, sin mezclar su integración.
- Objetivo: reemplazar wrappers exclusivos de `lbax` por wrappers separados de
  staging y producción.
- Requisitos: project ref literal, confirmación distinta, CLI link exacto,
  allowlist de funciones, migraciones pendientes conocidas y pausa global.
- Prohibición: un comando Testing Center nunca puede desplegar funciones
  Billing.
- Tests: principal rechazado por staging, staging rechazado por producción,
  vínculo ausente/distinto y mayúsculas rechazadas.

### TC-SUP-06 — Worker Linear neutral e inerte

- Tipo: backend/Edge.
- Dependencias: TC-SUP-04/05.
- Objetivo: retirar nombres/secrets `PILOT` e ISA-243 del runtime futuro.
- Estado inicial: invocación manual, un reporte sintético, worker ID por entorno,
  secret independiente, sin cron y pausa revalidada antes del efecto.
- Tests: token previo al dispatch reintentable solo según contrato; toda
  incertidumbre posterior termina en `needs_owner`; deduplicación y fencing.
- Gate: ninguna llamada externa durante esta issue.

### TC-SUP-07 — Purga TTL real

- Tipo: privacidad/schema/tooling.
- Dependencias: TC-SUP-03.
- Objetivo: convertir expiraciones en purga operativa.
- Alcance inicial: ejecución manual segura o job backend independiente; no se
  introduce Cron sin decisión explícita.
- Tests: dry-run agregado, apply idempotente, consentimiento revocado, replay
  vencido, reporte abierto preservado y cero PII en auditoría.
- Gate: PostHog continúa apagado aunque este corte pase.

### TC-SUP-08 — Gate local acumulado

- Tipo: test.
- Dependencias: TC-SUP-02..07.
- Checks mínimos:
  - todos los runners `run-testing-center-*-postgres.ps1`;
  - `run-supabase-hardening-postgres.ps1`;
  - Deno completo de Testing Center;
  - deploy-surface guard;
  - clean install, upgrade, restore, reapply y concurrencia;
  - auditoría de grants/RLS y corpus de PII/secrets.
- Stop: cualquier fallo no comprendido o flake no reproducible.
- Cierre: review adversarial sin P0/P1.

### TC-SUP-09 — Preflight de staging

- Tipo: operación remota controlada.
- Dependencia: TC-SUP-08.
- Acciones: backup lógico de staging, inventario de migraciones/funciones,
  Security Advisor, pausa confirmada y dry-run exacto.
- Stop: datos reales, secret de producción, versión desconocida o bundle más
  amplio que el manifiesto.
- Gate humano: Isaac autoriza el apply de schema inerte.

### TC-SUP-10 — Schema inerte y smoke en staging

- Tipo: migración remota; riesgo alto.
- Dependencia: TC-SUP-09 y autorización explícita.
- Orden: migraciones → RLS/grants → Security Advisor → cuenta sintética → Edge
  feedback. Linear, PostHog y Discord siguen apagados.
- Build: local y explícita contra staging. No sustituir temporalmente variables
  globales del workflow de release.
- Smoke: login email/password, crear reporte, dedupe, feedback, rechazo,
  eliminación de cuenta y lectura cruzada denegada.
- Gate: build contiene exclusivamente el ref de staging.

### TC-SUP-11 — Separación de builds y GitHub Environments

- Tipo: CI/tooling.
- Dependencia: TC-SUP-10.
- Objetivo: impedir que una build Nightly use por accidente el backend equivocado.
- Diseño: GitHub Environments separados, variables públicas por entorno,
  secretos propios y selector cerrado por canal/ref.
- Tests: matriz canal→project ref, ausencia de valores en logs/cache keys,
  artefacto inspeccionado y build con ref desconocido rechazada.
- Gate: no modificar secretos existentes sin inventario y autorización humana.

### TC-SUP-12 — Backup fresco y schema inerte en producción

- Tipo: operación remota; riesgo crítico.
- Dependencias: TC-SUP-10/11 verdes y restore proof vigente.
- Preflight: backup fresco del principal, checksum, inventario Auth/Billing,
  migraciones exactas, pausa activa y ventana de contención.
- Apply: solo schema aprobado; ninguna función nueva ni efecto externo.
- Verificación: Auth/licencias/Billing sin regresión, RLS negativa, Security
  Advisor sin hallazgos nuevos y dry-run Testing Center sin filas reales.
- Stop: cualquier diferencia no prevista. No intentar reparar durante la
  ventana; activar contención y abrir issue forward-fix.

### TC-SUP-13 — Primary tester, reporte y Linear presenciado

- Tipo: activación controlada.
- Dependencia: TC-SUP-12 estable.
- Orden:
  1. desplegar solo feedback/submission aprobados;
  2. conceder membership a un primary tester real y revocable;
  3. enviar un reporte sintético sin logs/replay;
  4. comprobar una fila canónica y cero efecto bajo pausa;
  5. autorizar manualmente un único efecto Linear;
  6. observar una issue, binding, webhook y dedupe;
  7. devolver pausa a activa.
- Stop: PII, doble issue, lease residual, assignee/prioridad/delegate inesperados
  o efecto durante pausa.
- Cierre: Isaac revisa Linear y el tester confirma la build. No hay promoción
  automática.

### TC-SUP-14 — PostHog, Discord y evolución Codex

- Tipo: proyectos posteriores, siempre en issues separadas.
- PostHog: SDK/captura/replay solo tras masking, consentimiento y purga remota.
- Discord: mensajes sanitizados de issue resuelta, Nightly disponible, rechazo
  y promoción; nunca evidencia privada.
- Codex: mantener handoff humano. Cualquier propuesta de automatización requiere
  nueva ADR, presupuesto, sandbox, control de rama/SHA y kill switch.
- Este corte no es requisito para considerar operativo el MVP de reporte→Linear.

## 8. Modelos y reviews

- Documentación/tooling simple: Codex normal o high.
- Migraciones, Auth, RLS, privacidad y despliegue: worker high/xhigh y reviewer
  xhigh independiente, sin edición durante la revisión.
- Operación remota: un solo agente ejecutor para evitar carreras; no paralelizar
  Docker, CLI Supabase o applies.
- Un subagente nunca recibe secrets, dumps, filas reales ni permiso de deploy.

## 9. Gates humanos

Isaac debe aprobar explícitamente:

1. protección y restore proof del backup;
2. estrategia final de renumeración;
3. apply de staging;
4. cambios en GitHub Environments/secrets;
5. backup fresco y apply inerte de producción;
6. concesión del primary tester;
7. única llamada Linear productiva;
8. promoción Nightly → Testers y Testers → Master;
9. cualquier activación PostHog, Discord o automatización Codex.

## 10. Stop conditions globales

Detener inmediatamente si:

- `migration list` contiene una versión desconocida;
- el dry-run exige `--include-all` o `migration repair`;
- el SQL operativo deja de coincidir con la versión remota;
- una migración toca Billing/Auth fuera del contrato;
- el backup no restaura completamente;
- el borrado del usuario sintético falla;
- un usuario sin entitlement puede invocar un RPC;
- un usuario puede leer datos de otro;
- una build contiene el project ref equivocado;
- un deploy Testing Center alcanza funciones Billing;
- se produce un efecto externo con pausa activa;
- aparece PII en Linear, logs, Discord o errores;
- Security Advisor introduce un hallazgo nuevo;
- hace falta compartir un secret entre staging y producción;
- hay cambios ajenos o una base sucia en el worktree.

## 11. Contención

Ante un fallo después de un apply:

1. mantener o activar pausa global;
2. ocultar Testing Center mediante canal/membership;
3. revocar exclusivamente secrets nuevos de Linear/PostHog/Discord;
4. no revocar anon/publishable key principal;
5. desactivar funciones nuevas si es seguro;
6. conservar tablas aditivas inertes;
7. abrir una issue de migración forward;
8. restaurar el backup solo ante corrupción y con ventana autorizada.

## 12. Definición de terminado del programa

El primer rollout queda terminado cuando:

- staging y producción comparten un historial reconciliado y documentado;
- el backup principal tiene restore proof vigente;
- Auth/licencias/Billing no presentan regresión;
- RLS y doble autorización fallan cerrados;
- borrar una cuenta sintética funciona según la política;
- un primary tester puede reportar y validar desde Nightly;
- un reporte sintético genera exactamente una issue Linear sanitizada;
- dedupe, webhook, pausa y contención están demostrados;
- Codex continúa bajo handoff humano y la PR requiere revisión;
- no se ha promovido ninguna build sin gate explícito.

## 13. Verificación manual para Isaac

En cada gate remoto Isaac recibe una ficha breve con:

- entorno y project ref;
- rama, base y SHA;
- migraciones/funciones exactas;
- checks verdes y omisiones;
- datos sintéticos usados;
- estado de pausa antes y después;
- pasos visibles en la app;
- riesgos y acción de contención.

Una aprobación parcial no cierra el corte ni autoriza el siguiente.
