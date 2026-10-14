# Contrato v1 — autorización de datos y administración (beta nativa)

Autor: orquestador (Opus 5.5), 2026-10-03. Issues #1452 (Testing Center) y #1456 (miniapp admin).
Fuente de verdad compartida por tres workers. Si un worker necesita cambiarlo, lo propone en su informe; no lo cambia por su cuenta.

## 0. Entorno

- Producción Supabase: proyecto `olhwhfaczmrmooeaoqqf` (vantare-overlays, Londres). Ahí está desplegada `native-license`.
- Clerk: instancia **development** (`enabled-lionfish-1336.clerk.accounts.dev`), app OAuth nativa «Vantare Desktop (nativo)», PKCE obligatorio.
- Cuenta interna: `account_identities` (iss, sub) → UUID (#909). Owner/tester: asignaciones operativas existentes (`normalizeOperationalAssignments`).
- Ningún worker despliega ni aplica migraciones: lo hace el orquestador.

## 1. `native-account-authorize` (Edge Function, `verify_jwt=false`)

Spec completa: `docs/superpowers/specs/2026-10-02-puente-cuenta-nativa-spec.md` §3 (rama de servidor). Resumen vinculante:

- `POST {"version":1}`, `Authorization: Bearer <OAuth access token de Clerk>`, sin apikey. Rechaza campos extra, body > 1 KiB, bearer vacío o > 16 KiB.
- Valida el token OAuth con Clerk (instancia y client_id fijados en servidor; `openid profile`; vigente; sujeto de usuario). Nada de identidad desde el body.
- Resuelve `(iss, sub)` → UUID con el mismo bootstrap de #909 (reutilizar, no duplicar).
- Respuesta `200 {"version":1,"account_id":"<uuid>","data_access_token":"<jwt>","expires_at":<unix s>}`, vigencia ≤ 300 s. El token de datos es un JWT que PostgREST acepta con rol `authenticated` y `sub` = UUID interno, firmado con la clave de proyecto (secreto solo en servidor). Si el proyecto usa claves de firma asimétricas nuevas y no se puede firmar desde Edge, el worker lo dice y propone la alternativa más simple.
- 401 si OAuth inválido; 403 si la cuenta está bloqueada; nunca filtra detalles.
- **Origen:** hasta que exista `vantare.app`, la app llama directamente a `https://<ref>.supabase.co/functions/v1/native-account-authorize`. El cliente relaja su guarda: permite el mismo origen que Supabase **solo** para esa ruta exacta (el bearer OAuth nunca va a PostgREST). Con el dominio, se pasará a `https://vantare.app/v1/native-account/authorize` (Cloudflare → Edge) sin cambiar el contrato.

## 2. `native-admin` (Edge Function, `verify_jwt=false`) — solo owner

- Misma autenticación que §1 (OAuth Clerk → cuenta). Exige asignación operativa **owner** vigente; si no, 403. Cada acción queda en un registro de auditoría (`admin_audit_log`: actor, acción, objetivo, antes/después, timestamp).
- `POST {"version":1,"action":<acción>,...}`; respuesta `{"version":1,"ok":true,...}` o `{"version":1,"ok":false,"error":"<código>"}`.
- Acciones:
  - `search_accounts` `{query, limit≤50}`: por correo o nombre (la función consulta Clerk Backend API con su secreto para obtener correo y nombre; el cliente nunca ve el secreto). Devuelve `[{account_id, email, name, created_at, last_seen_at|null, roles:[owner|tester], modules:[...], reports_count}]`.
  - `get_account` `{account_id}`: lo mismo con detalle.
  - `set_tester` `{account_id, enabled:bool}`: crea o revoca la asignación operativa `tester` (y la membership de Testing Center del canal `testers` que exige `testing_center_submit_report`). No toca owner.
  - `set_module` `{account_id, module, enabled:bool}`: concede/revoca `vantare.module.*` por usuario (tabla de concesiones existente, ver #1451).
  - `get_rollout` / `set_rollout` `{module, enabled_for_all:bool}`: tabla `module_rollout` (#1451).
  - `list_reports` `{status?, limit≤100, cursor?}`: reportes del Testing Center con autor (correo), módulo, versión, texto, fecha, estado y si tiene capturas.
  - `get_report` `{report_id}`: detalle + URLs firmadas de sus capturas (caducan en ≤ 10 min).
  - `set_report_status` `{report_id, status}` con los estados que ya admita el esquema.
- Límite de peticiones razonable por actor. Sin borrado de cuentas ni de datos en v1.

## 3. Capturas del Testing Center

- Flujo existente del esquema: prepare → upload → finalize → attach (migración `20260814154558_testing_center_screenshot_evidence.sql`; bucket privado `testing-center-evidence`, PNG/JPEG, 10 MiB máx.). Reutilizarlo.
- Cliente: captura opcional de la pantalla al reportar; vista previa obligatoria; el tester decide si la adjunta (y puede quitarla).
- **Compresión obligatoria** antes de subir: JPEG, lado mayor ≤ 1920 px, calidad ~75, objetivo < 400 KiB por captura; máximo 3 capturas por reporte. Sin dependencias nuevas si el workspace ya tiene un codificador (p. ej. el crate `image` que arrastre GPUI); si no lo hay, justificar la dependencia más pequeña.
- Sin metadatos (EXIF) ni nombres de fichero con rutas de usuario.

## 4. Tester y envío

- Iniciar sesión no basta para enviar reportes: hace falta rol tester (lo da Isaac desde la miniapp). Sin rol, el Testing Center lo explica claro («Tu cuenta aún no está habilitada para enviar reportes») y conserva el borrador.

## Apéndice de implementación del servidor — #1452 / #1456

§0–§4 conservan el texto del orquestador. Concreciones de este corte, sujetas a
su revisión del diff completo:

- Datos: JWT HS256 con `iss=<SUPABASE_URL>/auth/v1`, `aud/role=authenticated`,
  `sub=UUID interno`, TTL ≤300 s y ≤exp OAuth. `NATIVE_DATA_JWT_SECRET` debe ser
  exactamente la clave legacy aceptada por el proyecto; se admite
  `SUPABASE_JWT_SECRET` si ya existe en el runtime. No se inspeccionaron claves
  remotas. Si solo acepta asimétricas, el uso real queda bloqueado; alternativa
  propuesta: importar una ES256 dedicada y custodiar su privada en Edge,
  adaptar WebCrypto y probar kid/gateway/RLS con autorización propia.
- `native-auth.ts` comparte el validador OAuth de `native-license`.
  Cliente/scopes/sujeto no autorizados son 401 en las dos funciones nuevas;
  bloqueo `banned`/`locked` se comprueba con Clerk Backend y produce 403.
  Errores del proveedor/configuración no filtran detalles y fallan con 503.
- `native_resolve_account`, solo service_role, llama al resolver privado de
  #909/#1444; no reclama dispositivo ni fabrica auth.users. Cinco FKs de
  memberships/reports/submission_keys/report_events/evidence_batches pasan a
  profiles, validando filas existentes y preservando cascade/restrict.
  No migra promociones/validaciones ni adapta `resolve_current_account`:
  reset remoto de dispositivo necesita un corte propio. No unir por email.
- Admin: JSON cerrado 8 KiB, bearer 16 KiB, 60 peticiones/minuto por actor en
  presupuesto PostgreSQL persistente. Owner vigente se verifica antes del
  directorio y nuevamente dentro de la RPC. Auditoría append-only para las nueve
  acciones, incluidas lecturas; mutación y audit se confirman juntos. Un fallo
  Clerk/Storage posterior a leer SQL devuelve 503 y conserva esa lectura auditada.
- Búsqueda: query correo/nombre 1–200 bytes, limit 1–50 defecto 50. Solo devuelve
  mappings existentes del issuer configurado; nunca crea destinos. Contacto
  sale de Clerk; sin mapping/usuario disponible es null. created_at es interno.
  Los READMEs definen los campos exactos de las respuestas compartidas.
- `get_rollout` no recibe campos y devuelve array rollout; set_rollout devuelve
  objeto rollout. Módulos usan los cuatro nombres completos vantare.module.*.
  Se conserva POLAR_ENVIRONMENT y los grants support existentes. Revocación
  individual no vence rollout/owner/tester ni una credencial ya firmada.
- `set_tester` conserva owner y su acceso, incluso al pedir false. Owner activo
  caducado no se sustituye: true produce 409 account_conflict. Conceder tester
  reemplaza nightly_tester según el índice existente de un rol activo. Rol y
  membership se confirman juntos; no toca Polar ni la asignación owner.
- Reportes: estados draft/submitted/validated/duplicate_linked/incomplete/closed.
  Cursor = report_id ascendente/exclusivo, limit 1–100 defecto 100; no dispara
  triage/agentes/promoción. Capturas ready ligadas al reporte, URLs por 600 s;
  se lee máximo histórico 10, conservando máximo beta 3 para nuevos adjuntos.
- verify_jwt=false para ambas. Allowlist TS/PowerShell las reconoce; wrapper
  comercial/workflows no cambian. Destino beta explícito olhwhfaczmrmooeaoqqf,
  distinto del project_id histórico del config. READMEs dan comandos y nombres
  de secretos; ningún worker los ejecuta remotamente.

Evidencia fuera de Git en `C:/tmp/isa-1452-srv-evidence/`: PostgreSQL 18.3 clean
y upgrade con filas históricas, pgTAP de acciones/audit/rollback/FKs/owner/rate
y envío/screenshot prepare/RLS con UUID interno. Regresiones #909,
native_license_bridge y roles operativos ejecutadas. Deno usa Clerk/Storage
inyectados. PostgREST 16.4 local aceptó el JWT emitido por el handler, resolver y
envío por HTTP, RLS entre cuentas y rechazo anónimo/alteración/caducidad. Usa
clave pública de fixture y Clerk simulado: no acredita login físico, gateway,
signing keys ni Storage remotos. No se tocó Rust; no se ejecutó Cargo.

Antes del uso real: revisión Opus, inventario de migraciones remotas,
confirmación de signing key aceptada, deploy autorizado y QA real de owner,
tester y cuenta sin rol. No se hizo link, db push, deploy, lectura/creación de
secretos, cambios Clerk, push, PR, merge ni release. Notion no disponible por
excepción expresa; el orquestador reconciliará seguimiento y handoff compartido.
