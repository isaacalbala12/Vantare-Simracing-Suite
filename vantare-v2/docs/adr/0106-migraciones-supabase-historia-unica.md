# ADR 0106 · Una cadena de migraciones Supabase y un esquema derivado

Estado: aceptada por el orquestador (revisión general VANTA-131); Isaac la puede
revisar. Compartida con R3. Fecha: 2026-11-04. No autoriza despliegues.

## Contexto

La producción se reconstruyó con la cadena histórica: 96/96 migraciones el
19-oct-2026 y cambios de pagos posteriores el 26-oct. La evidencia operativa
está en `evidence/supabase-reconstruccion/EJECUCION.md`. Por tanto, compactar
ahora la historia en bases nuevas obligaría a coordinar `migration repair`
contra una base con datos y versiones aplicadas. Mantener a la vez bases nuevas
y la cadena intacta crearía dos fuentes de verdad.

## Decisión para migraciones nuevas

La cadena ordenada de `supabase/migrations/*.sql` sigue siendo la **única**
autoridad de cambios. R6 y R3 añaden migraciones incrementales en ella;
ningún dominio edita SQL histórico ni crea una base alternativa.

- Cada función modificada se define completa con `create or replace function`
  y su cuerpo entero. Se prohíbe construir una definición nueva con
  `pg_get_functiondef` y `replace()` u otra sustitución textual. `replace()`
  sigue permitido para transformar datos normales, no definiciones de SQL.
- Cada tabla, vista, secuencia y función nueva o modificada declara la ACL
  final para `PUBLIC`, `anon`, `authenticated` y `service_role`: revocación
  explícita de los cuatro y concesiones exactas que necesita el contrato.
  RLS se define aparte; no sustituye los privilegios de objeto.
- Cada migración nueva tiene `supabase/rollbacks/<mismo-stem>.down.sql`.
  El rollback restaura esquema y ACL o aborta antes de perder datos que no
  pueda restituir. Se prueba en PostgreSQL local, en orden LIFO.
- Una migración nueva no usa `auth.uid()`. Cuando necesita la cuenta de un
  bearer nativo, usa el contrato de identidad vigente (`private.current_account()`)
  y comprueba el caso anon y el de otra cuenta.

Un lint de CI aplicará estas reglas solo a migraciones **posteriores al corte
del merge de esta ADR**. La historia previa conserva sus excepciones y sus
rollbacks. El test `hub_server_acl_characterization.test.sql` del paso 0
permanece como matriz esperada de permisos.

## Esquema vigente y límites

`supabase/schema/<dominio>.sql` será un volcado normalizado de solo lectura,
generado al reproducir la cadena completa en PostgreSQL local. El reparto
por dominio parte del prefijo de cada tabla. Incluirá ACL, RLS, triggers y
las filas de catálogo relevantes de buckets, cron y semillas de política.
Nadie lo edita a mano; la CI falla cuando no coincide con la cadena. Es un
artefacto de revisión, no una segunda ruta de aplicación.

La Fase B (compactar a unas seis bases, archivar la cadena y sus rollbacks,
comparar A=B=C con el esquema alojado y ejecutar `supabase migration repair`)
requiere ventana y autorización separada de Isaac. Esta ADR no llama ni cambia
ningún entorno alojado.
