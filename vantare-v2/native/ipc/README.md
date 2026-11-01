## #1827 — Servicios v16: Session explícita

`AccountCancel` (v16) cancela solo el intento OAuth/FAPI y relee Session;
conserva la cuenta protegida y los derechos. «Volver/Cancelar» lo usa sin
sustituirlo por Logout. Solo «Cerrar sesión» envía Logout. En NeedsSignIn,
Cuenta ofrece Google/Discord/email y también el cierre explícito de sesión.


`Reply::Account.session` es obligatorio y cerrado: SignedOut, SignedIn,
NeedsSignIn o Pending. Solo services publica ese hecho; Session no concede
permisos. Hub y supervisor leen la versión antes de decodificar la respuesta
estricta. Binarios de generaciones distintas se rechazan sin revocar la licencia;
el paquete debe actualizarse completo. No cambian el control v6, DTO v11 ni
los formatos guardados de cuenta o derechos.

## #1806/#1807 — Control v6

InstallOnline distingue una renovación recién verificada por el helper de un
Install de disco. Solo el helper autenticado por imagen y nonce puede mutar;
el núcleo vuelve a verificar la firma. Los peers de control v5 se rechazan.
La incompatibilidad es transitoria y no invalida la licencia guardada.
El lector comprueba primero la versión de Response y después su esquema estricto:
un campo desconocido de otra generación produce VersionMismatch, mientras que
ese mismo campo con versión actual sigue siendo un error de protocolo.
Esto no cambia lectores v5 ya distribuidos, que pueden dar el aviso genérico;
también requieren actualizar el paquete completo para obtener el diagnóstico.
`Policy.online_recovery_required` permite admitir al helper sin derechos cuando
el núcleo exige una renovación nueva; la señal no concede ni instala licencias.

El paquete completo lleva núcleo, supervisor, helper y consumidores en una
misma generación: `packaging/candidate.ps1` valida inventario y hashes antes
de cambiar la referencia activa. No se distribuyen EXE sueltos para este cambio.

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
