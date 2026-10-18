# Escrituras tras borrado de cuenta · #1702 / VANTA-96

Base: nightly 999d5950745f73be0e38a1763422f53b515c6866, que integra #1703.
Solo bases desechables; sin producción, proveedores, credenciales ni activación.

## Diagnóstico de las nueve aserciones originales

| Aserción | Diagnóstico | Corrección |
|---|---|---|
| inbox-checkout: espera/bloqueo | Fixture anterior a guard v2: complete devuelve false sin billing_begin_checkout_request; no existe binding. | Usar el protocolo actual y exigir complete=true y binding presente antes de iniciar la carrera. |
| inbox-checkout: rechazo tombstone | El mismo evento queda sin dueño por la fixture anterior. No se estaba probando la barrera de la cuenta. | Mantener la aserción y ensayar el evento con dueño durable real. |
| inbox-checkout: ningún contenido restaurado | La misma fixture permite guardar un evento sin vínculo; el test lo considera de la cuenta borrada. | La fixture corregida obliga a clasificar el tombstone antes de persistir el evento. |
| Catálogo: tablas sin barrera | Once tablas posteriores a #1608 necesitan la defensa de escritura. Dos relaciones tienen semántica distinta. | Nueva migración con once guards; documentar y probar cola de borrado y aprobación histórica por separado. |
| Catálogo: FK sin cobertura | Los once guards anteriores faltan, incluidos los enlaces compuestos del registro de borrado. | Compilar todas sus rutas FK; excluir únicamente los dos casos semánticos descritos abajo. |
| admin_account_blocks sin carrera | La barrera ya existía; faltaba una escritura válida en la matriz. | Insertar un bloqueo en control positivo y carrera real de dos transacciones. |
| admin_creator_payouts sin carrera | La barrera del actor ya existía; faltaba la fixture del creador y su pago. | Crear un creador sintético y ensayar el INSERT con actor vivo/borrado. Mantener la inmutabilidad del recibo. |
| admin_payment_history sin carrera | La barrera ya existía; faltaba la ruta en la matriz. | INSERT válido y carrera real. |
| admin_payments sin carrera | La barrera ya existía; faltaba la ruta en la matriz. | INSERT válido con los campos financieros exigidos y carrera real. |

## Las trece tablas privadas del inventario

| Tabla private | Contrato aplicado |
|---|---|
| report_promotions | Historial comercial privado conservado; impedir INSERT/UPDATE tardíos para la cuenta borrada. |
| report_promotion_invoices | Facturas conservadas; guard del account_id y regresión real. |
| report_promotion_invoice_gaps | Incidencia comercial conservada; guard del account_id y regresión real. |
| report_promotion_failures | Incidencia comercial conservada; guard del account_id y regresión real. |
| report_promotion_launch_uses | Consumo/reserva de oferta conservado; guard del account_id. No renovar una oferta por borrar su historial. |
| report_promotion_changes | Descendiente de report_promotions por account_id/environment; compilar y ensayar la FK compuesta. |
| report_promotion_transfers | Descendiente de report_promotions por account_id/environment; mismo contrato. |
| mail_consent_budget | Contador ligado a cuenta; impedir nuevas escrituras tras tombstone, incluso fuera de la RPC de consentimiento. |
| admin_account_deletions | Recibo que se inserta antes de borrar y se conserva para reintentos; impedir nuevas inserciones falsificadas tras borrar. Cubrir account_id y la FK compuesta issuer/subject. |
| mail_contacts | PII/consentimiento ligado al titular actual y al de borrado. Guard para ambos UUID; DELETE sigue permitido para encolar al proveedor. La dirección suprimida de una cuenta viva puede reasignarse a otra verificada: se bloquean y validan OLD y NEW sin imponer la inmutabilidad de una identidad Clerk a un email. |
| mail_deliveries | Propiedad por contacto destinatario, no por el aprobador de la campaña. El borrado del contacto elimina sus entregas. Un INSERT tardío reintentado devuelve 23503 si el contacto ya desapareció; se acepta solo para esta ruta y se comprueba ausencia de contacto y entrega. |
| mail_contact_erasures | Excepción explícita: deber de borrado creado después del tombstone. Debe poder reservar, reintentar, caducar y confirmar ACK después. Conserva mutex de correo, lease, fencing, retención acotada y ACL cerrada. La regresión prueba encolado/claim/ACK y retirada de PII después del borrado real. No se excluyen descendientes nuevos de la inspección. |
| mail_campaigns | approved_by es procedencia histórica, no propiedad de cada contacto o entrega. La regresión crea/aprueba una campaña, borra al aprobador y exige que otro Owner vivo pueda continuar para un destinatario ajeno. La excepción se limita a mail_campaigns_approved_by_fkey; no a todas las FK de campañas o correo. |

La migración no recompila los guards existentes de Storage, auditoría y privacidad.
No añade permisos ni un bypass basado en GUC/entrada del usuario. Se mantiene
el orden UUID antes de filas; el fallback de trigger conserva el rechazo 40001
sin esperar si la transacción ya tiene filas. Los historiales comerciales no
se borran para conseguir que una carrera pase.

## Verificación

El arnés añade `--migration-newlines lf|crlf`: escribe fuentes con esos bytes antes
de entregarlas a psql, también dentro de los cuerpos de función. La opción
`--before-private-write-barriers` es el control RED que omite únicamente esta
migración; el gate normal siempre la aplica. La nueva suite SQL se incorpora
al arnés completo, sin continue-on-error.

El workflow independiente `.github/workflows/supabase-commercial-gates.yml` se
ejecuta en PR a nightly con cambios en `supabase/**`. No modifica workflows
anteriores ni checks requeridos. Instala clientes PostgreSQL, PostgREST 16.1
(SHA256 comprobado) y Deno 2.7.13; usa el servidor de la imagen Supabase
PostgreSQL 17.6.1.165 fijada por digest, con reintentos ECR/Docker Hub.
`--docker` crea su propio contenedor/base, publicado solo en loopback, con
credenciales públicas de fixture y limpieza al salir; no acepta DSN remoto.
Cada formato arranca de cero. Además del gate SQL y las carreras, se ensaya
HTTP con JWT emitido por el handler nativo y PostgREST real.

Comando después de preparar imagen, PostgREST y caché Deno como en el workflow:

```sh
python3 supabase/tests/run-commercial-local.py --docker \
  --pg-bin "$(pg_config --bindir)" --postgrest-bin /ruta/postgrest \
  --deno-bin "$(command -v deno)" --migration-newlines lf --output /tmp/commercial-lf
# Repetir con --migration-newlines crlf y otra carpeta de salida.
```

Resultados finales y comandos reproducibles en
`C:/VantareServer/evidence/supabase-write-races/`. Estado inicial: baseline
reproducido con 633 PASS / 9 FAIL. La evidencia final debe acreditar exit 0
en LF y CRLF; no se da por terminado con una prueba estática o CI parcial.
