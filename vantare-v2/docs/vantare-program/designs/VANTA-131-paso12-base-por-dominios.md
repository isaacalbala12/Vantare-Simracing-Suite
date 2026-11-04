# VANTA-131 · Paso 12: base de migraciones por dominio — diseño para revisión

Estado: propuesta concreta, sin SQL ni despliegue. Base de lectura:
`origin/nightly@3397df2ea` (#1924 integrado). Se ejecuta después de cerrar 7b
y de integrar #1934. La base de billing pertenece a R3 en otro PR. Este encargo
no modifica SQL de billing, licencias ni admin.

## Resultado

Un conjunto de archivos SQL legibles reconstruye los dominios R6 en un
PostgreSQL/Supabase **local y vacío**. La cadena histórica de
`supabase/migrations/` queda intacta para proyectos ya migrados. La nueva base
vive fuera de esa carpeta, sin inclusión automática por `supabase db push`.
Un manifiesto fija orden y SHA-256 de cada archivo. El paso 12 no cambia el
proyecto enlazado, wrappers de despliegue ni datos alojados.

| Orden y archivo propuesto | Propietario y contenido |
| --- | --- |
| `supabase/baselines/r6/00-prerequisites.sql` | R6: esquemas/roles requeridos, preflight de pgcrypto y versión Storage; no instala secretos. |
| `10-identity.sql` | R6: cuentas, identidades, `current_account()`, locks y barrera de borrado que no referencia billing. |
| `20-storage.sql` | R6: políticas, ownership y triggers de Storage ya aprobados, condicionados a la versión fijada. |
| `30-testing.sql` | R6: membresías, `testing_contributions`, informe v2, cuotas y agente v2 inerte; sin tablas de informes legacy, archivo, Linear ni Codex. |
| `40-roadmap-calendar.sql` | R6: lectura pública de roadmap y calendario; publicación owner con `private.is_owner()`. |
| `90-cross-domain.sql` | Integración compuesta: borrado Clerk y enlaces entre dominios. Solo se materializa tras recibir los bloques de R3 y admin; este encargo no reescribe sus funciones. |

Cada archivo tiene `supabase/baselines/r6/rollbacks/<nombre>.down.sql`.
Las definiciones de funciones son completas; se prohíbe transformar cuerpos
con `pg_get_functiondef` y `replace()`. Cada cambio posterior crea otra
migración por dominio con `down.sql`, test de caracterización y prueba de
reaplicación. La ADR propuesta es `0106-base-sql-por-dominios.md`.

## Composición y equivalencia local

1. Congelar en el manifiesto el SHA de nightly tras 7b, la versión de
   PostgreSQL, las extensiones y la versión de Storage. El preflight de
   pgcrypto prueba `extensions.digest` y `public.digest` en dos configuraciones
   locales. #1933 conserva la investigación y cualquier arreglo de la cadena
   histórica en PR separado; R3 es dueño de sus llamadas de billing.
2. Crear dos bases desechables con el mismo bootstrap del harness. **A**
   reproduce la cadena histórica hasta el SHA congelado. **B** aplica el
   manifiesto R6, la base billing del PR de R3 y las piezas admin de VANTA-132
   en el orden declarado. Si falta alguna pieza, el gate de equivalencia no
   puede declararse verde.
3. Comparar `pg_dump --schema-only` con la misma versión de `pg_dump`, sin
   eliminar definiciones, grants, políticas, triggers ni índices. Normalizar
   únicamente cabecera/identificador aleatorio del dump. Comparar por separado
   propietarios, `relacl`, `attacl`, `proacl`, RLS, `FORCE RLS`, políticas,
   constraints y extensiones. Una diferencia requiere una excepción escrita y
   revisada; no se actualiza automáticamente el baseline esperado.
4. Ejecutar el mismo corpus en A y B: cuenta verificada y borrada, otra
   cuenta, anon, sin membresía, IP compartida, cuotas, informe simple/triage,
   replay, Storage sin capturas activas, lectura del agente, calendario y
   roadmap. Comparar recibos, SQLSTATE y filas observables. Los gates de
   billing y admin los aportan sus propietarios y se ejecutan también en B.
5. En B, aplicar rollbacks en orden inverso con guardas de datos, verificar
   ausencia de objetos y reaplicar. Los rollbacks solo admiten una base vacía
   de usuarios; las rutas de upgrade siguen la cadena histórica.

## Retiradas y límites

El SQL histórico de Linear (#1905) no se ejecuta como una retirada sobre un
proyecto existente. Se omite de la base nueva solo después de comprobar por
`rg` y tests que Hub, web, digest y scripts de despliegue no lo llaman; un
preflight local comprueba que no quedan efectos pendientes. Lo mismo vale
para los RPC v1 y tablas huérfanas que se incluyan en este corte. Las rutas
de admin y billing se componen mediante contratos de sus dueños, sin editar
su SQL en R6.

Los triggers sobre `storage.*` se conservan únicamente si el harness fija
la versión, columnas y GUC reales y pasa las carreras de borrado de cuenta.
Si falla ese contrato, se detiene el paso 12 y se presenta un cambio de
diseño para limpieza por API; no se reescribe Storage de forma implícita.
Las capturas siguen desactivadas hasta completar el paso 6b y sus P3.

## Orden de entrega

1. #1934 y cierre final 7b integrados en nightly; #1933 y #1936 resueltos o
   excluidos expresamente del manifiesto.
2. ADR 0106 y tests de equivalencia **antes** de escribir las bases.
3. PR R6 pequeño por grupo de archivos y rollback, todos draft contra nightly;
   PR billing de R3 y contrato admin por sus dueños.
4. PR de composición local con dump/ACL y corpus A=B. La preparación de un
   proyecto Supabase vacío, `db push` y cualquier promoción son actos futuros
   de Isaac con autorización separada.

Esta propuesta no afirma que producción esté vacía: no se la consulta.
