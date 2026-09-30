# Entrega local para revisión de Opus — #1430

2026-09-30. Rama `vantareapp/isa-1430-w-servicios`, worktree
`C:/tmp/vw3-servicios/vantare-v2`, raíz Git `C:/tmp/vw3-servicios`.
Base asignada `e8b0927a3e8f63b8e89d2043b18c57ac1753c0fd`.
Referencia técnica GitHub #1430; Notion no disponible, excepción explícita de
Isaac de trabajar solo con GitHub. No se declara seguimiento Notion completado.
No push, PR, merge, CI remoto, promoción ni release; solo commits locales.
Stash «WIP servicios previo a rediseño» intacto, sin recuperar ni leer contenido.

| Hito | SHA | Evidencia / límite |
|---|---|---|
| ADR + decisiones D1–D7 y Clerk | `b566c6cdaaeb62ba09e640c9b9fd96c49dd7fa5d` | Documento ratificado; issues #909/#911/#915 y PRs #1173/#1187 inventariados, sin presumir merge/despliegue. |
| 1. Host / almacenamiento | `a4c2533c4d49cf95cb5cf6bf0831e9ae6a213c6f` | Helper, ACL/peer/nonce/frames, DPAPI, reemplazo durable y un escritor. |
| 2. Cuenta | `b1be5b9b4f6bfb19f858d4d268371b9839de396a` | Clerk OAuth PKCE/loopback/navegador, sesión/restauración/renovación/logout local. Config pública OAuth nativa aún no existe en build. |
| 3. Licencias | `f099dfaa03c56841acd629f344b63d5b9f85bbd9` | Verificación v1/JWS, key instalación, política/DPAPI/reloj y cliente legacy; enforcement núcleo/consumidores pendiente fuera de ownership. |
| 4. Roadmap | `b0194143610dbb9d9480dab015c410e53a374ae4` | RPC actual, última publicación válida, caché por contexto y Orbit. |
| 5. Testing Center | Commit que contiene este documento | Texto/borrador, preview/consentimiento efímero, intento manual durable y recibo. El SHA exacto se entrega en el chat al cerrar el commit. |

El corte 3 **no está completo extremo a extremo**: runtime/IPC/manifests/
packaging son de otros workers. No se tocaron. El contrato concreto y límites
están en [INTEGRATION.md](INTEGRATION.md). Servicios no concede derechos ni
inventó un snapshot Pro del núcleo. Renovación/reset del host permanecen
inertes hasta puente y ACK durable del núcleo. La biblioteca pura sí prueba la
hora desde expiry firmado, sin gracia fuera de juego ni reinicio del plazo.

## Gates finales antes del commit 5

| Workspace | `cargo fmt --check` | `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | `cargo test --workspace -j 2` |
|---|---|---|---|
| `native/services/` | exit 0 | exit 0 | exit 0: 22 unit + 1 proceso local; 0 fallos/ignored |
| `native/` | exit 0 | exit 0 | exit 0: 622 passed, 0 failed, 4 ignored |

Perfil aislado `--no-default-features`: clippy all-targets -D warnings -j 2 y
tests -j 2 exit 0, 8 passed/0 failed/0 ignored. Es prueba de biblioteca aislada,
no del futuro grafo core tras unificar features en el workspace.

Cuatro ignorados heredados requieren LMU/ACC físicos activos; no se arrancaron.
Sin Go/frontend modificados: no se ejecutaron sus suites. No hay prueba de
renderizado/interacción GPUI ni red/backend real. HTTP de pruebas solo servidor
loopback dentro del test; claves y tokens de fixture generados en test. Gates
también pasaron antes de cada commit Rust anterior; incidencias de compilación/
clippy durante desarrollo se corrigieron antes de cerrar cada hito.

Salidas locales completas (ignoradas por Git):
`target/corte5-services-tests.log`, `target/corte5-offline-tests.log`,
`target/corte5-native-tests.log`. El reporte versionado recoge resultados;
no se copian cachés ni logs ajenos. No valores reales de configuración, `.env*`,
secretos, claves privadas ni tokens reales leídos, impresos o copiados.

## Configuración pública exacta del build

Solo `option_env!`, nombres inventariados del producto/workflow:

| Variable | Uso |
|---|---|
| `VANTARE_SUPABASE_URL` | Proyecto/origen HTTPS de datos y aislamiento de cachés. |
| `VANTARE_SUPABASE_ANON_KEY` | Anon pública, nunca service_role. |
| `VANTARE_LICENSE_PUBLIC_KEYS` | Trust roots Ed25519 `kid:base64url-sin-padding`, separadas por coma. |
| `VANTARE_BUILD_CHANNEL` | Contexto de build; informes solo nightly/testers. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Nombre público de #1187; no se interpreta como OAuth client ID. |
| `VANTARE_VERSION` | Versión pública del artefacto; si falta, versión del crate. |

**Esos nombres no bastan para activar cuenta/remotos privados.** No existen
nombres de build acordados para issuer/client ID/redirect OAuth nativo ni URL
del puente. No se inventaron aliases ni se convirtió una publishable key en
client ID. Owner integra esos parámetros públicos en `BuildConfig::native_oauth`
y el hook `App::configure_bridge` después de acordar backend; sin ello, «servicio
no configurado». Nunca secretos de Clerk/JWT signing ni service_role en desktop.
No reenviar OAuth a Supabase TPA como si fuera JWT de sesión Clerk.

## Verificación real pendiente: corte 6

1. Opus integra manifests/packaging y autoridad/IPC descritos en INTEGRATION;
   verifica grafo core sin red, peer/nonce/ACL y ACK de invalidación.
2. Owner crea cliente público Clerk PKCE/S256 con redirect loopback registrado,
   páginas alojadas y scopes; confirma descubrimiento/endpoints/callback real.
   Backend valida OAuth/resuelve UUID interno y migra RLS/RPC de licencias/TC.
   Configurar build público sin proporcionar secretos al worker.
3. En cuenta/proyecto de prueba de Isaac: login/reinicio/refresh/rotación/logout;
   expiración, clock rollback, cambio de cuenta y reset con revocación durable.
   No revocar cuenta/sesiones ajenas ni usar usuarios productivos.
4. Juego/core/overlays/Engineer reales con Hub cerrado: caducar grant válido
   a la entrada, comprobar T+3599/T+3600, salida, reconnect/restart y ausencia
   de margen fuera de juego. Corroborar origen/época/revisión de derechos.
5. Roadmap real: publicación válida/vacía, desconexión y schema incompatible.
   Informe de prueba solo tras preview y consentimiento explícito; simular
   respuesta perdida, reiniciar y repetir manualmente: mismo ID, un recibo.
6. Medir CPU/RSS/arranque/cierre. Sync de perfiles/layouts no implementada:
   plan estima ~29 GiB/mes a 1.000 usuarios/100 KiB/10 lecturas diarias;
   comprobar corpus/frecuencia/cuotas/tarifas antes de autorizar, sin gasto,
   Realtime ni sync continua.

Límites abiertos: export temporal del Input privado (allow localizado y motivo
en INTEGRATION), campos UI de una línea, un intento pendiente por proyecto/canal,
sin adjuntos/autoenvío/revocación Clerk remota. DPAPI no evita admin/malware del
mismo SID ni restauración de todo el perfil antiguo. JWS v2/enrollment es destino
propuesto probado localmente; backend actual emite v1. Decisiones pendientes de
owner: contrato público OAuth/puente, wiring core/IPC/packaging y aceptación del
Input compartido. No se sustituyen por fixtures ni por gates locales verdes.

## Ficheros de la entrega (rutas relativas a vantare-v2)

- `docs/adr/0099-arquitectura-rust-nativa.md`
- `docs/superpowers/plans/2026-09-30-servicios-hub.md`
- `native/hub/src/lib.rs`
- `native/hub/src/shell.rs`
- `native/hub/src/services/{mod,client,view}.rs`
- `native/hub/src/testing/mod.rs`
- `native/services/{.gitignore,Cargo.toml,Cargo.lock,README.md,INTEGRATION.md,DELIVERY.md}`
- `native/services/src/{lib,account,app,bridge,config,error,host,http,license,license_remote,protocol,report,report_document,roadmap,roadmap_document,storage,test_http}.rs`
- `native/services/src/bin/vantare-services.rs`
- `native/services/src/account/tests.rs`
- `native/services/src/license/{authority,installation,tests}.rs`
- `native/services/src/license/installation/windows.rs`
- `native/services/src/license_remote/tests.rs`
- `native/services/src/report/{tests,windows}.rs`
- `native/services/src/storage/windows.rs`
- `native/services/tests/process.rs`

Sin ficheros movidos/borrados, sin núcleo, IPC, widgets ni Go editados.
