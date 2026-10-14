# Integración de compra Clerk (#1514)

Base candidata a8f9bdc3; rama vantareapp/isa-1514-identidad-native.
Integrar commit OAuth 0e3436fc y commit de compra posterior, por separado.
Backend principal #1523 contiene migraciones scheduler/recovery/UUID/RLS y las
11 funciones comerciales: aplicar primero y registrar issuer/azp/native_data_issuer.
No duplicar handlers ni ejecutar solo el corte de servidor contra un cliente viejo.
IPC versión 4: servicios y Hub se distribuyen juntos.

OAuth/PKCE se mantiene. native-billing-checkout verifica OAuth con Clerk y resuelve
el mismo UUID que TPA web; no convierte OAuth a sesión web. Native-license consulta
grants efectivos (refund/disputa) y conserva un equipo. Puente de datos existente
con máximo cinco minutos y claims firmados de procedencia Clerk. JWT de login
Supabase sin esos claims no obtiene datos en las nuevas policies.

Build público: VANTARE_SUPABASE_URL, VANTARE_SUPABASE_ANON_KEY,
VANTARE_CLERK_ISSUER, VANTARE_CLERK_CLIENT_ID, VANTARE_CLERK_REDIRECT,
VANTARE_ACCOUNT_BRIDGE_URL, VANTARE_LICENSE_PUBLIC_KEYS,
VANTARE_BILLING_ENVIRONMENT (sandbox o production), VANTARE_BUILD_CHANNEL,
VANTARE_VERSION. Sin .env ni valores privados. Sandbox Supabase confirmado:
lbaxvpzexoferfvfkplz, pausado; Clerk development y Polar sandbox.

Botones Pro mensual/anual y Launch guardan intento protegido antes de HTTP y lo
reutilizan por cuenta/producto/entorno después de una respuesta incierta. Solo el
error tipado de intento caducado permite limpiarlo. URL validada para host/entorno
Polar, sin credenciales/puerto. Al abrir compra, licencia se renueva cada cinco
segundos durante diez minutos; redirect no concede licencia.

Checks: workspace nextest 1218 PASS, 6 omitidos por perfil existente; clippy
-D warnings PASS, fmt PASS; build config 13 PASS. Deno candidato 518 PASS,
1 ignored por PostgREST local ausente. Captura cuenta-base intentada pero falló
antes de Cuenta: sidebar.rs:286 del candidato usa Role::GenericContainer y GPUI
lanza panic. Backtrace en C:/tmp/isa1514-r3-native-capture-backtrace.log.
Es un hallazgo de #1501; captura no aceptada. Sin login/pago físico real hasta
restaurar/configurar sandbox. No merge, instalación real, release ni promoción.

Integrar también el commit de catálogo/trial anual posterior al de compra.
POLAR_PRODUCT_MAP tiene plantilla pública en supabase/functions/scripts/
polar-product-map.sandbox.json; POLAR_TRIAL_ANTI_ABUSE_CONFIRMED sigue cerrado
hasta comprobar antiabuso real. No ampliar los siete días ni capabilities Pro.
