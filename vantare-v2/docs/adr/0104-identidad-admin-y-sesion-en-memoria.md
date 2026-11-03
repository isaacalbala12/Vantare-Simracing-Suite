# ADR 0104 · Identidad de Gestión y sesión en memoria

Estado: aceptado por el orquestador en VANTA-132 / #1910, 2026-11-03.
Ámbito: `native/admin` y la autenticación de `native-admin`. No cambia el Hub,
billing, licencias ni la configuración de ningún servicio.

Gestión comparte hoy el cliente OAuth del Hub. Separar el directorio local no
separa la autoridad de sus tokens. Gestión usará un cliente público propio de
Clerk, «Vantare Gestión», con PKCE y callback loopback distinto. Isaac lo creará
con access tokens JWT y TTL de cinco minutos. No se guardan IDs reales ni
secretos en el repositorio.

La activación es explícita en ambos lados. La app usa valores públicos compilados
`VANTARE_ADMIN_AUTH_ENABLED=true`, `VANTARE_ADMIN_CLERK_CLIENT_ID` y
`VANTARE_ADMIN_CLERK_REDIRECT`. La Edge usa `CLERK_ADMIN_AUTH_ENABLED=true` y
`CLERK_ADMIN_CLIENT_ID`. Sin activación se conserva el cliente Hub y su camino
opaco actual, sesión en disco y diagnóstico sin login interactivo. No migra ni
revoca nada mientras la bandera esté inactiva. Un ID configurado sin la bandera no activa Gestión. Una
configuración activa incompleta o que reutilice el cliente Hub falla cerrada.

Con Gestión activa, la Edge solo acepta JWT OAuth de ese cliente: firma RS256
con JWKS cacheado, issuer, client_id, aud o azp y exp comprobados localmente antes
del contador global y de la introspección. No hay fallback opaco. Después se
mantienen la introspección, comprobación de cuenta y autorización SQL de owner
en cada petición. `native-license` conserva su propio contrato sin cambios.

Solo con Gestión activa la sesión vive en memoria. Cada apertura pide
login; completar PKCE y refrescar no escriben cuenta ni perfil. En su Store solo
se conserva la metadata OAuth pública y el bloqueo local. Cerrar sesión revoca
el refresh y olvida la sesión en memoria incluso si la red falla, informando del
fallo sin confirmar una revocación que no ocurrió. Cerrar el proceso libera la
memoria; no intenta una llamada de red durante la destrucción del proceso.

En el primer arranque ACTIVO, la migración retira exclusivamente el antiguo
Store privado de Gestión, nunca el del Hub. Aparta cuenta/perfil con fecha y
borra esos documentos locales sin revocar su antiguo refresh del cliente Hub,
ni siquiera si su blob está dañado. Así no arriesga la concesión compartida con
el Hub. Si no puede borrar por E/S, conserva la evidencia y bloquea restauración,
con aviso y reintento al reiniciar. No recorta cuarentenas pendientes.

La revocación FAPI de sesiones del cliente Gestión propio envía client_id y
token_type_hint=refresh_token. Un 400 con invalid_token, invalid_grant,
token_expired o token_revoked confirma que el token ya no es utilizable y se
trata como éxito. invalid_client, errores desconocidos, daño o fallos de red
no confirman revocación y conservan el blob si se trata de retirar una sesión
guardada de Gestión. Logout olvida su sesión en memoria aun si falla la red.
Pruebas solo con Store y HTTP sintéticos; nunca el almacén real.

Clerk [documenta FAPI como revocación por token](https://github.com/clerk/openapi-specs/blob/main/fapi/2026-08-20.yml),
pero [BAPI revoca access y refresh de la concesión asociada a la aplicación](https://clerk.com/docs/reference/backend/oauth-applications/revoke-token).
No se asume aislamiento por dispositivo a partir de esa frase FAPI: la migración
del antiguo cliente Hub hace únicamente borrado local. Gestión usa otro cliente;
su revocación puede retirar la concesión de Gestión, sin seleccionar el cliente Hub. La especificación FAPI publicada no enumera client_id en ese formulario: antes de activar, Isaac debe comprobar en un cliente de desarrollo que acepta la petición pública con client_id y que deja operativo un token del Hub. La bandera sigue inactiva hasta esa comprobación; aquí solo se prueban fixtures.

Revocar el refresh no invalida instantáneamente un access JWT ya emitido: sigue
vivo hasta exp. El límite aceptado es el TTL de cinco minutos que configurará
Isaac al activar Gestión, más la tolerancia de reloj de 60 s de la Edge.
No se añade registro de revocación, jti ni schema en estos pasos.
Referencias: [formatos de tokens de Clerk](https://clerk.com/docs/guides/development/machine-auth/token-formats)
y [verificación OAuth](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens).

Esta entrega prepara código inactivo. Activar el cliente, desplegar la Edge y
verificar la configuración real corresponden a Isaac. El rollback de binarios
no recupera una sesión ya revocada: exige login nuevo. No hay migración SQL en
estos dos pasos.
