# VANTA-131: propuestas para los pasos 7 y 12

Estado: diseño aprobado por Isaac el 2026-11-03 para código de los pasos 7 y 12; no autoriza despliegue ni merge. Issue [#1896](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1896). Base examinada: `origin/nightly@8066d1c8e`. El diseño general sigue en `D:\VantareServer\evidence\revision-general\hub-servidor-DISENO.md`.

## Paso 7: un único modelo de informe

### Contrato y datos

1. `testing.report.v2` será el único cuerpo que Services envíe a `testing-report-submit`. Campos obligatorios: versión, `report_id` UUID, canal, título, texto, consentimiento y clave de idempotencia. La variante simple, la de triage y el borrador enriquecido se expresan con campos opcionales validados por discriminante; la identidad de cuenta nunca viene del cuerpo.
2. La Edge verifica el bearer nativo, resuelve la cuenta, valida el DTO completo y aplica la admisión del paso 2. El mismo `(cuenta, clave, digest canónico)` devuelve el mismo recibo; otro digest con esa clave se rechaza. La IP conserva su límite independiente. La Edge solo llama a una función privada de escritura: `private.testing_report_submit(...)`.
3. Esa función escribe en `testing_contributions` como raíz y, cuando corresponda, en `testing_contribution_context`, `testing_contribution_attachments`, `testing_report_followup` y las capturas validadas del paso 6. La transacción crea una sola raíz o no crea nada. El recibo identifica esa raíz y su estado; el cliente no necesita conocer tablas ni RPC antiguas.
4. La lectura de seguimiento, revisión y `fixed` se adapta a esa raíz. Antes de retirar `testing_center_reports`, se cierra cada escritura antigua y se demuestra por búsqueda de llamadores que Hub, web, digest y scripts ya usan el contrato v2. Las filas existentes se migran con una correspondencia de IDs comprobada en PostgreSQL local; si un dato no se puede transformar sin pérdida, la migración aborta. No se presupone que producción esté vacía.
5. `report.rs`, `triage.rs` y `testing.rs` en Services construyen el mismo DTO mediante una función pura. `ipc` define el contrato versionado; Hub conserva sus pantallas y solicita a Services la preparación/envío. Se elimina la lógica duplicada y `rich-report.ts` solo después de que el corpus de los tres cuerpos haya pasado.

### Agente v2 y límites

`testing_center_get_agent_job_state` todavía consulta `testing_center_reports`. Decisión: adaptar solo esa lectura y cualquier enlace de trabajo a `testing_contributions`, con autorización equivalente. No habrá vista de compatibilidad ni segunda tabla de informes. Los jobs y callbacks permanecen inertes; no se configura dispatch, workflow, credenciales ni ruleset.

No se cambia billing, licencias ni admin. Las operaciones de _shared que ya sirven a esos dominios se revisan explícitamente antes de editar.

### Orden, rollback y prueba

1. Antes del primer cambio: fixtures de los tres cuerpos actuales, recibo, cuota, reintento exacto, rechazo de cuerpo cambiado y matriz de autorización; registrar RED para la equivalencia exigida.
2. Añadir el DTO y el RPC nuevo con rollback; probar en PostgreSQL local y Deno. Mantener las rutas viejas cerradas mientras los clientes migran.
3. Pasar los tres clientes Rust al constructor común. Gates `fmt`, check, Clippy, Nextest, lifecycle y telemetría mediante `compilar.ps1` y la cola del repo.
4. Migrar lecturas y agente v2 según la decisión. Probar cuentas distintas, anon, no miembro, IP compartida, cuenta borrada y capturas maliciosas.
5. Retirar tablas y RPC antiguos solo tras búsqueda de llamadores y test de esquema. Cada migración tiene rollback; el de retirada restaura el esquema anterior y **rechaza** ejecutarse si hay informes v2 que no puedan conservarse. No hay despliegue ni llamada a producción.

La ADR del Testing Center fijará el DTO, la única raíz, la idempotencia, el contrato de recibo, el estado del agente v2 y el punto exacto donde termina la compatibilidad.

## Paso 12: base de migraciones por dominio

### Resultado y límites

Se preparan bases legibles para identidad, Storage, Testing Center y roadmap/calendario, con definiciones completas, grants y RLS explícitos y rollbacks por dominio. Las migraciones anteriores se archivan, no se borran. La política de nuevas migraciones prohíbe transformar cuerpos con `pg_get_functiondef` + `replace`; se crea la definición completa y se prueba su rollback. Ningún archivo se aplica a producción en este encargo.

Billing comparte la cadena histórica. Decisión: R3 es dueño de su base y de sus checks en un PR separado; aquí se fija el contrato de equivalencia y se prueba la composición con su resultado, sin editar SQL de billing. El paso 12 se ejecuta después del 7.

### Construcción y equivalencia

1. Congelar el SHA de la cadena histórica aprobada y la versión del PostgreSQL/Supabase local. Dos bases descartables arrancan desde el mismo bootstrap: A ejecuta la cadena histórica completa; B ejecuta las bases nuevas en orden identidad → Storage → testing → roadmap/calendario → billing de R3.
2. Comparar `pg_dump --schema-only` normalizado: objetos, columnas, tipos, constraints, índices, funciones completas, triggers, políticas RLS, grants, owners y comentarios de contrato. La normalización quita solo ruido no semántico (orden de dump y metadatos del cluster); cualquier diferencia exige explicación revisada. La matriz ACL del paso 0 corre en ambas bases.
3. Probar datos sintéticos en las dos rutas: identidad real verificada, cuenta borrada, Storage, informe simple/estructurado con abusos, calendario y roadmap. Comparar resultados y SQLSTATE observables. Las pruebas de billing y sus invariantes pertenecen a R3.
4. Cada base de dominio tiene rollback en orden inverso, con guardas que rechazan datos que se perderían. La promoción de esta base a un proyecto Supabase es una operación futura y separada de Isaac. No se afirma que producción esté vacía porque está prohibido consultarla.

### Storage y coordinación

Antes de conservar triggers sobre `storage.*`, un test local fijará versión de Storage, tablas/columnas/GUC utilizados y la carrera de cuenta borrada. Si la versión soportada no mantiene esos contratos, el diseño se cambia a limpieza por API de Storage y se presenta la variación antes de editar. No se sustituyen triggers silenciosamente.

La ADR de plataforma fijará orden de dominios, propiedad de R3 sobre billing, reglas de migración/rollback, normalización del dump, versión de Storage y procedimiento de reconstrucción sin acceso a producción.

## Decisiones de Isaac (2026-11-03)

1. Paso 7: adaptar solo la lectura del agente v2 a `testing_contributions`; sin vista de compatibilidad.
2. Paso 12: la base de billing pertenece a R3 en un PR separado; este encargo no edita su SQL.
3. El SQL histórico de Linear permanece inerte hasta el paso 12, donde se retira en la base por dominios. El draft #1905 se cerró sin integrar.
4. Orden aprobado: paso 7 antes de conectar la subida firmada del paso 6. Las capturas siguen desactivadas entretanto.

El código del paso 7 está autorizado; el paso 12 sigue después del 7. Ninguno autoriza desplegar.
