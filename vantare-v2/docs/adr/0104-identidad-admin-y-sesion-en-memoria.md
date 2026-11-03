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
opaco actual. Un ID configurado sin la bandera no activa Gestión. Una
configuración activa incompleta o que reutilice el cliente Hub falla cerrada.

Con Gestión activa, la Edge solo acepta JWT OAuth de ese cliente: firma RS256
con JWKS cacheado, issuer, client_id, aud o azp y exp comprobados localmente antes
del contador global y de la introspección. No hay fallback opaco. Después se
mantienen la introspección, comprobación de cuenta y autorización SQL de owner
en cada petición. `native-license` conserva su propio contrato sin cambios.

La sesión de la app Gestión vive en memoria en ambos modos. Cada apertura pide
login; completar PKCE y refrescar no escriben cuenta ni perfil. En su Store solo
se conserva la metadata OAuth pública y el bloqueo local. Cerrar sesión revoca
el refresh y olvida la sesión en memoria incluso si la red falla, informando del
fallo sin confirmar una revocación que no ocurrió. Cerrar el proceso libera la
memoria; no intenta una llamada de red durante la destrucción del proceso.

En el primer arranque, la migración retira exclusivamente el antiguo Store de
Gestión, nunca el del Hub. Al cambiar de cliente aparta cuenta y perfil con fecha
y conserva su contexto antiguo para descifrarlos. Revoca cada refresh antes de
borrar su blob, y después elimina el perfil. Si la revocación falla o el blob está
dañado, conserva la evidencia, no restaura la sesión, muestra un aviso y bloquea
el uso de Gestión hasta el siguiente arranque, que reintenta. Las cuarentenas de
esta migración no se recortan por el límite de cachés. No se abre el Store real
en pruebas: solo directorios temporales y credenciales sintéticas.

Revocar el refresh no invalida instantáneamente un access JWT ya emitido: sigue
vivo hasta exp. El límite aceptado es el TTL de cinco minutos que configurará
Isaac al activar Gestión. No se añade registro de revocación, jti ni schema.
Referencias: [formatos de tokens de Clerk](https://clerk.com/docs/guides/development/machine-auth/token-formats)
y [verificación OAuth](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens).

Esta entrega prepara código inactivo. Activar el cliente, desplegar la Edge y
verificar la configuración real corresponden a Isaac. El rollback de binarios
no recupera una sesión ya revocada: exige login nuevo. No hay migración SQL en
estos dos pasos.
