## ISA-1793 — Servicios v15

`LicenseRenewAutomatic` separa la recuperación automática de la revocación
explícita. `LicenseFailure` transporta un resultado cerrado definitivo o
transitorio; `RenewalOutcome` también representa verificación. `Probe` comprueba
el canal sin consumir avisos. No se transportan credenciales ni tokens nuevos.
Hub, supervisor y helper se recompilan juntos; peers anteriores se rechazan.

# ipc — fotos versionadas

DTO explícito, transporte autenticado y demanda; la versión de foto es independiente de servicios y control.

VANTA-51/#1628: servicios v13 añade consulta y cambio de consentimiento de
correos mediante OAuth nativo. Hub y servicios deben recompilarse juntos;
`MailConsent` solo confirma la respuesta de `native-mail-consent`, nunca un
flag local. El protocolo no transporta correo, identidad ni tokens.

VANTA-83/#1661: `BillingProduct::Founders` junto a AccountEmail (#1631) en servicios v11 y
`CatalogAccess::Founders` en control v5. Las fotos usan v11 en esta rama (#1638). Los componentes
del conjunto se recompilan juntos; no negociar silenciosamente el plan con peers antiguos.

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
