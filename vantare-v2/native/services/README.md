# Servicios nativos — ISA-1430

`vantare-services` es miembro de `native/`: un workspace, `Cargo.lock`, edición
y lints compartidas. Proceso de usuario bajo demanda, sin GPUI/simuladores.
El supervisor `vantare` posee el auxiliar; el Hub solo manda comandos IPC.
El núcleo verifica y persiste la credencial y publica derechos a los consumidores.
Cuenta Clerk y datos Supabase tienen contratos distintos; el puente privado
permanece inactivo hasta acordar configuración/backend con Isaac.

```powershell
cd native
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo nextest run --workspace --build-jobs 2 -j 2
$env:RUST_TEST_THREADS = '2'
cargo test --workspace --test lifecycle -j 2
```

Máximo dos jobs, una compilación a la vez. Logs y target standalone histórico
están fuera del repo, en `C:/tmp/servicios-evidence/`; no recuperar el stash previo.
No hay dependencias async/DB/bus nuevas: se reutilizan transporte Win32/ACL,
ureq/TLS del lock, formatos/entropía mínimos y Ed25519/DPAPI de los cortes previos.
La biblioteca de verificación se consume con `default-features = false`; IPC es
común, HTTP/URL opcionales. Las pruebas de runtime habilitan network solo como
dev-dependency. Cargo unifica features en una compilación conjunta: ese grafo
no se presenta como prueba de ausencia de TLS en el artefacto completo.

IPC v3 distingue en `ReportReceipt` un borrador limpiado, otro posterior
conservado y una limpieza pendiente. Confirmar un reintento solo retira el
borrador con su misma idempotency key; un error de lectura conserva el archivo.
Hub, supervisor y auxiliar comparten el contrato y deben compilarse juntos.
`Account` comunica también el error y el estado real del intento: un callback
rechazado mantiene polling; caducidad/intercambio fallido lo termina. Reiniciar
explícitamente libera el listener anterior y estrena generación, state y PKCE.

El host IPC comparte implementación Windows/Unix sobre `vantare_ipc::transport`.
El watcher del padre usa `Builder::spawn`: si no puede crear el hilo, devuelve
error de protocolo también en Windows, en lugar de provocar un panic.

Sin configuración se muestra «servicio no configurado», con funciones básicas
y borradores locales. La hora de excepción solo aplica a derechos válidos al
entrar a la sesión live; no hay otra gracia offline. Límite de restauración
tras reinicio frío e identidad de carrera, contrato exacto de Clerk pendiente,
variables del build, IPC, aceptación y riesgos: [INTEGRATION.md](INTEGRATION.md).
Commits/gates/evidencia y alcance real: [DELIVERY.md](DELIVERY.md).

Roadmap: última publicación válida; Testing Center: texto, borrador DPAPI,
preview/consentimiento efímero, intento durable manual y recibo. Sin autoenvío.
Tests: HTTP loopback, claves generadas, procesos/pipes y DPAPI de fixtures;
ningún secreto ni credencial real, `.env*` ni backend real. El corte 6 queda
pendiente de Isaac; sync de perfiles/layouts no se implementa aquí.

### Desarrollo Unix — #1437

El auxiliar y su cliente usan `vantare-ipc` también en Linux/macOS: socket Unix
local, mismo nonce, límites, PID e imagen del par. La sesión y demás datos del
`Store` se guardan bajo `$XDG_CONFIG_HOME/Vantare/native/services` (Linux,
`~/.config` si no está definido) o `~/Library/Application Support/Vantare/native/services`
(macOS). Cada namespace queda en un directorio `0700`; los JSON y el lock son
`0600`, y el reemplazo es atómico. A diferencia de DPAPI, Unix no cifra esos
JSON: los permisos protegen frente a otros usuarios, pero no frente a procesos
del mismo usuario, administrador/root, ni acceso al disco fuera del sistema.

El contrato v1 conserva el fingerprint heredado como SHA-256 de `HOME|GOOS`
(`linux`/`darwin`). La clave Ed25519 de instalación
conserva su ID RFC 7638 y prueba de enrollment; queda en el `Store` privado.
El backend v2 aún no está desplegado, por lo que la renovación v1 sigue usando
el fingerprint heredado también en Unix.

### Testing Center beta — #1452

El binario conecta `App::configure_bridge` con `BuildConfig::data_bridge`.
Compilar servicios con `VANTARE_ACCOUNT_BRIDGE_URL` (endpoint HTTPS completo),
`VANTARE_SUPABASE_URL`, `VANTARE_SUPABASE_ANON_KEY`, `VANTARE_BUILD_CHANNEL`
(`nightly` o `testers`), `VANTARE_VERSION` y la configuración pública OAuth
`VANTARE_CLERK_ISSUER`, `VANTARE_CLERK_CLIENT_ID`, `VANTARE_CLERK_REDIRECT`.
No se leen aliases de entorno en ejecución: hay que recompilar el binario.
El origen del authorize debe ser distinto al de Supabase, sin credenciales,
query ni fragmento. Una configuración parcial/inválida deja el puente inactivo:
«servicio no configurado: falta el puente de identidad». Los borradores locales
siguen disponibles. HTTP tiene plazo global de 8 segundos y no sigue redirects.

El envío usa solo el bearer de datos en
`rest/v1/rpc/testing_center_submit_report`, nunca el OAuth Clerk. El usuario
revisa el payload antes de consentir. El intento queda protegido antes del POST;
401, 403, 5xx, desconexión y respuesta malformada conservan borrador/intento.
Un 401 descarta la sesión de datos: el siguiente intento vuelve a autorizar.
«Reintentar» recupera el mismo payload e idempotency key, incluso tras reiniciar;
una cuenta/canal distintos no pueden enviarlo. El recibo confirmado evita volver
a enviarlo. **El reintento es manual**, no hay monitor de conectividad ni cola
automática: el contrato vigente exige una nueva preview/consentimiento efímero.

El reporte incluye acción/esperado/observado (descripción), módulo, versión,
canal y sistema operativo. Texto: hasta 2048 bytes por descripción y 4096 de
contexto, borrador hasta 16 KiB. Este corte **no adjunta logs, simulador ni
capturas**, ni declara datos de una sesión que servicios no observa. El supervisor
descarta stderr (`hub/src/launcher/chain.rs` y `services/src/process.rs`);
no existe una fuente de logs compartida acotada y sanitizada que pueda reutilizarse
dentro de este encargo. La RPC sí acepta diagnóstico/logs (payload de 64 KiB,
100 entradas), con estructura cerrada `testing-center.diagnostic.v1`, digest
SHA-256 y consentimiento. No tiene campo simulador ni captura: simulador podría
ir en contexto cuando exista dato observado; capturas requieren el flujo separado
prepare/upload/finalize/attach de la migración screenshot. No se modifica schema
ni se inventa un diagnóstico vacío para presentar los requisitos como cubiertos.
Captura, fuente real de logs con saneamiento y reintento automático requieren
continuación coordinada del supervisor/IPC/Hub y revisión del contrato de consentimiento.

Pasos pendientes de servidor para el orquestador (sin deploy en esta entrega):

1. La rama `isa-1444-puente-servidor`, revisada en
   `04cb73bc89ecc4f7dded0cbeb0a29a96fe57dd04`, implementa `native-license`
   (OAuth → licencia firmada), **no** `native-account-authorize`
   (OAuth → bearer de datos). `license-credential` firma licencias para una
   sesión de datos existente; Third-Party Auth no convierte el access token
   OAuth nativo en un session JWT Clerk. No apuntar authorize a esos endpoints.
2. Implementar el endpoint acordado en la spec de puente: POST `{"version":1}`,
   bearer OAuth validado con la API oficial Clerk, binding de issuer/client/scopes/
   caducidad y resolver compartido `(issuer, subject)` → UUID interno (sin email).
   Respuesta exacta: `version:1`, `account_id` UUID, `data_access_token`,
   `expires_at` Unix segundos, vigente como máximo 300 segundos. No basta
   responder con la credencial Ed25519 de `native-license`.
3. Acordar origen HTTPS distinto a Supabase y configurar verificación del bearer
   de datos en gateway/PostgREST según la spec (firma, UUID, aud/role/iss/exp y
   RLS). Claves privadas solo en backend, nunca build. Si se aloja como Edge,
   `verify_jwt=false` para la entrada OAuth y dominio/proxy aprobado sin registrar
   Authorization. Verificar alias, TTL, revocación y rechazo de otro usuario.
4. Verificar en el entorno real migraciones/grants y membership activa de Testing
   Center: `testers` admite tester/primary_tester/owner; `nightly` exige
   primary_tester/owner. La beta «cualquier cuenta Clerk» no elimina esa guarda:
   el login solo no habilita el envío. No conceder memberships desde el cliente.
5. Inyectar la URL pública acordada en el build y ejecutar QA autorizada de
   punta a punta con el artefacto recompilado. Deploy/config remotos y envío
   real quedan a cargo del orquestador; aquí solo se usa HTTP loopback de tests.

Consulta de solo lectura al inventario del conector Supabase (2026-10-03): su
proyecto activo `ombjshwzqgeisazijduq` devuelve 17 migraciones y cuatro Functions,
sin `native-license` ni `native-account-authorize`; `license-credential` v4 tiene
`verify_jwt=true`. Esto contradice las 30 migraciones y el despliegue de
`native-license` comunicados por el orquestador. **No se acredita que el conector
apunte al entorno del encargo**: contrastar project ref/versión del inventario
con el despliegue real antes de compilar o probar. No se leyó ni modificó ninguna
clave/config privada. La licencia real verificada por el orquestador no sustituye
la prueba del puente de datos. Notion no disponible por excepción del encargo;
seguimiento allí pendiente. Evidencia local fuera del repo:
`C:/tmp/isa-1452-evidence/`. Sin dependencias nuevas, push, PR, merge ni release.

Validación local #1452: fmt, Clippy sin warnings, 42 tests de servicios y
1020 del workspace aprobados (cuatro ignorados de fuentes live que necesitan
juegos/configuración real). Lifecycle: cinco de Engineer y los once escenarios
de Runtime aprobados con `RUST_TEST_THREADS=2`. La primera ejecución de lifecycle
con paralelismo predeterminado falló por timeouts; su log se conserva. No pasar
`--test-threads 2` al harness propio de Runtime: interpreta `2` como filtro y
puede salir con código 0 sin ejecutar escenarios. Usar la variable de entorno
para limitar libtest y comprobar las once líneas de resultados de Runtime.
