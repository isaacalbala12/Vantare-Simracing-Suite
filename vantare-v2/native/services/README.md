# Servicios nativos — ISA-1430

Proceso de usuario bajo demanda, sin GPUI/simuladores. Cuenta Clerk OAuth y
datos Supabase son identidades/contratos distintos; sin puente validado no se
reenvía OAuth bearer a RPC legacy. Núcleo es autoridad de licencia, no este host.

Workspace aislado porque manifests/runtime/IPC están fuera de las rutas del
worker. El Hub comparte únicamente la fuente DTO y usa pipes existentes con
ACL/peer/nonce privado; no añade HTTP ni dependencias. Opus integra después
el miembro services/dependencia y copia `vantare-services.exe` junto al Hub.
Ninguna modificación de núcleo/launcher se declara entregada por este crate.

Gates (máximo dos jobs, una compilación a la vez):

```powershell
cd native/services
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2
```

Ejecutar también los tres gates en `native/`. Tests HTTP solo loopback y entropía/
firmas generadas localmente. No `.env*`, secretos ni credenciales reales.
Dependencias propuestas en el plan: ureq/TLS, Ed25519, bindings DPAPI y utilidades
de formato/entropía/buffers mínimas; no runtime async, DB ni bus genérico.

Configuración pública existente `option_env!`: VANTARE_SUPABASE_URL,
VANTARE_SUPABASE_ANON_KEY, VANTARE_LICENSE_PUBLIC_KEYS, VANTARE_BUILD_CHANNEL,
VITE_CLERK_PUBLISHABLE_KEY (#1187). La última no es un client ID OAuth.
Client ID/issuer/redirect nativos y puente OAuth requieren contrato del owner
del build/backend: no inventar nombres/aliases ni usar Supabase Auth como fallback.
Ausencia de contrato/configuración produce «servicio no configurado».

El host arranca solo por un consumidor autorizado, verifica PID/imagen del
padre y nonce entregado por stdout heredado; stdin EOF cancela E/S. No datos
secretos en CLI/DTO/logs. Proceso oculto, deadlines finitos, cierre tras Hub.

Corte 1: fmt, clippy (`-D warnings`, `-j 2`) y tests (`-j 2`) pasan en ambos
workspaces. Servicios: 8 tests, incluido proceso real local y DPAPI de Windows.
El workspace nativo completo termina con código 0. No demuestra red remota,
renderizado del Hub ni derechos aplicados por el núcleo.

Corte 2: cuenta OAuth/PKCE con navegador externo y callback loopback limitado,
metadata validada y sesión DPAPI, renovación serializada, tombstone de logout y
generación contra respuestas tardías. OAuth bearer permanece en servicios; no
se trata como sesión Clerk TPA. Cuenta Orbit usa un worker I/O bajo demanda.
Los gates de ambos workspaces pasan (10 tests en servicios). Refresh ambiguo
no se reintenta automáticamente: si el proveedor consumió la rotación y perdió
la respuesta, se requiere nuevo login. Logout remoto/revocación de Clerk y ACK
de invalidación del núcleo requieren el puente/backend e IPC del orquestador.
No se afirma que el núcleo actual reaccione al logout del Hub.
