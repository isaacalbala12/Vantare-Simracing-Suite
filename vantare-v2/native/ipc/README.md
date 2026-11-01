# ipc — fotos versionadas

## Contrato vigente de acceso

Tres versiones independientes: servicios v19, control v7 y fotos v11. Se comprueba
la versión antes del esquema estricto, también la Policy anidada. Desajuste es
VersionMismatch/transitorio, sin revocar; un peer antiguo que cierra sin responder
puede dar desconexión genérica. El launcher usa services de su misma generación;
mezcla nuevo-services/viejo-núcleo no soportada. Instalador valida conjunto/hashes.
No se negocian permisos ni se distribuyen EXE sueltos. [ADR 0102](../../docs/adr/0102-modelo-acceso-nativo.md).

Control v7 publica Policy.state: Active/Grace permiten catálogo y módulos; los
demás estados deniegan. Gratis puede seguir Active al vencer Pro. signed_until_ms
y grace_until_ms separan firma/margen efectivo; TTL 2s. Policy.error es diagnóstico;
Policy::denied es el constructor conservador. ClockBehind.until_ms está en pared
(lápida efectiva menos forward_millis) y el aviso manual muestra fecha local.

Solo runtime::rights verifica firma y claims. InstallOnline transporta credencial
HTTP fresca; Install se conserva por compatibilidad de control, nunca como replay
de services desde disco. Imagen, nonce, secuencia y permisos de mutación se
mantienen. Rechazos firma/subject/device: rights-credential-invalid, clasificado
InvalidCredential y Version/Transient en services. REJECTED conserva lápida,
denegación y caducidad; iat conserva UNAVAILABLE/Clock. El lector v7 congelado
trata la etiqueta nueva como UnknownLegacy/Transient; su SHA-256 se verifica.

Services v19 no tiene TransferRights. Un peer anterior se rechaza antes del comando
retirado/esquema; declarar v19 con ese comando es Protocol, sin revocar. Solo los
actos explícitos Logout, cambio de identidad y DeviceReset invalidan derechos.
Account.session es enum cerrado SignedOut/SignedIn/NeedsSignIn/Pending; no concede
permisos. AccountCancel abandona OAuth/FAPI y conserva cuenta/derechos. Reply no
transporta tokens; AccountEmail/LoginLink redactan Debug.

LicenseStatus es local al supervisor: Policy, última Session observada y aviso,
sin arrancar helper. null no implica SignedOut. Aviso definitivo/DeviceLimit vive
en memoria hasta Verified, cierre o login confirmados. Transient/lectura/pérdida
de respuesta no lo consumen. Policy conserva diagnóstico tras reiniciar supervisor.
Solo Feed fresco confirma derechos/compra; scheduler único en
[runtime](../runtime/README.md#contrato-vigente-de-licencias-y-supervisor), presentación
[Hub](../hub/README.md#contrato-vigente-de-acceso-y-cuenta).

No cambian formatos activos de cuenta/binding/authority/guardias. Los restos
candidate/pending se apartan sin leer al arrancar, conservando rollback aislado
v17/pre-NeedsSignIn (`scripts/license-generation-rollback.ps1`). La compatibilidad
se conserva por la posible RC9; no se retiran lectores de disco ni fixtures aquí.
Historial/versiones anteriores: Git y [evidencia](../../docs/vantare-program/license-simplification-evidence.md).


DTO explícito, transporte autenticado y demanda; la versión de foto es independiente de servicios y control.

MailConsent confirma el endpoint native-mail-consent, nunca un flag local.
El protocolo de MailConsent no transporta correo, identidad ni tokens.
BillingProduct incluye Founders y CatalogAccess distingue su catálogo; ningún
mensaje transporta tokens ni negocia permisos con una generación anterior.

## #1562 · Ocultar fuera de pista

DTO v10 añade `state.driving_situation` a fotos completas y parciales, también
con demanda vacía. Campo ausente se lee Unknown; valor desconocido se rechaza.
En la entrega original el pipe live admitía v10; #1638 lo eleva a v11.
Los lectores guardados aceptan v7/v8/v9/v10/v11
sin reescribir originales. Servicios y control mantienen sus versiones propias.
Ver [contrato y señales](../runtime/README.md).

## #1638 · Avisos de sesión

DTO v11 añade los siete campos de `Session.timing` al grupo `SessionInfo`.
El cable solo negocia v11: hay que recompilar Core, Hub y overlays juntos.
Los lectores explícitos de datos guardados aceptan v7–v10 y convierten estos
campos a `Unavailable`; no cambian los archivos originales. Los tests y la
geometría demo usan ese lector de fixtures, nunca el pipe productivo.
Contrato, relojes, límites y conexión con #1653:
[`session-alerts-contract.md`](../../docs/telemetria/session-alerts-contract.md).
