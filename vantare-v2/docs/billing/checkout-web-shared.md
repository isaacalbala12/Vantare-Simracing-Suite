# VANTA-42 / #1620 · Checkout compartido de app y web

Entrega aislada desde nightly `3f82af867321876c9bcca19703831d9da7a3fed5`,
rama `vantareapp/isa-1620-checkout-web`. No acredita despliegue ni apertura.

## Contrato único

La migración canónica es
[`20261015191316_checkout_web_shared_guard.sql`](../../../supabase/migrations/20261015191316_checkout_web_shared_guard.sql).
Sustituye el borrador R2 de la web. Mantiene los cinco argumentos y outcomes
de claim; añade `guard_version=1`. Tanto el adaptador Edge de la app como
el Worker web exigen esa versión antes de llamar a Polar.

La RPC toma el lock canónico de UUID de #1622 ANTES de filas y comprueba el
tombstone. Ese mismo lock serializa app/web. Rechaza derechos efectivos activos
y otro intento de la misma cuenta/entorno/familia (suscripción o Launch).
Un lease caducado no prueba que Polar no pueda cobrar: sigue bloqueado hasta
reconciliación. No hay borrado global por antigüedad ni reset por cambiar de canal.

La finalización exige ID de checkout y conserva la barrera incluso en un no-op.
El trigger existente `retain_checkout_binding` registra el binding en la misma
transacción; sin ACK no sale URL. Reutilizar exige el binding coherente.
El webhook sigue resolviendo por binding/customer canónicos, nunca por correo
o metadata. No se añade endpoint, proveedor, secreto, dependencia ni lógica
alternativa de licencia. `mark_billing_checkout_attempt_uncertain` conserva
su implementación protegida de #1622.

## Orden de integración autorizado

1. Revisar esta rama y la web `vantareapp/web-compra`; mantener venta cerrada.
2. Aplicar la migración por el pipeline autorizado del backend y comprobar ACL.
3. Publicar los adaptadores Edge que usan el contrato; esquema antiguo produce
   cierre seguro. Verificar app y web en sandbox.
4. Aplicar D1 0003/0004 y cron de la web; completar catálogo, Clerk, privacidad,
   responsable de bajas y matriz comercial antes de solicitar apertura a Isaac.

No se modifican mapas de productos, `PURCHASE_OPEN`, política de privacidad
ni autorización comercial de #1633. No hay migración remota en esta entrega.

## Intentos pendientes

Investigar creando/pending >15 minutos; primera revisión humana en 24 horas,
escalado en siete días y revisión de cualquier hold a los 30 días.
Consultar intento, binding, customer, inbox, ledger y grants del entorno.
Confirmar en Polar el estado terminal y que ya no puede cobrar antes de retirar
el intento transitorio concreto. Conservar binding y ledger. Si hubo pago,
reconciliar por el camino de billing; no fabricar una licencia. No repetir el
POST ante timeout o resultado incierto. Los cambios de plan siguen fuera de alcance.

Para la app, completar también [recuperación nativa](native-checkout-recovery.md).
Para la web, el runbook `docs/web-compra-recuperacion.md` fija la retención D1:
contadores efímeros, minimización ready a 24h de caducidad, borrado a 30 días
y holds revisados hasta reconciliar.

## Baja #1622 y D1: paso manual obligatorio

El webhook Clerk y sus tareas duraderas limpian Supabase/Storage; no existe un
transporte privado autenticado hacia el D1 de esta web. No se introduce una ruta
HTTP destructiva ni una credencial Cloudflare con permisos amplios para suplirlo.
El borrado D1 NO es automático y el ACK de Clerk NO acredita haberlo hecho.

Antes de cerrar una baja, el responsable debe:
1. Completar #1622 y comprobar tombstone con el UUID interno verificado.
   Pausar la compra web y drenar solicitudes admitidas antes del borrado
   para evitar escrituras D1 tardías; no basta con el ACK de Clerk.
2. Reconciliar cualquier cobro pendiente sin eliminar evidencia financiera.
3. En mantenimiento privado del Worker, ejecutar
   `erasePurchaseAccount(env, account)` de `purchase-limits.mjs`.
   Alternativamente borrar mediante consulta parametrizada únicamente
   `purchase_attempts WHERE account_id=?` en D1 y comprobar su resultado.
4. Comprobar cero filas para el UUID, que no hay solicitudes previas pendientes,
   y que los contadores efímeros han sido purgados. Con la alternativa SQL,
   comprobar cron/ventanas caducadas antes de cerrar; no se puede atribuir un
   contador IP agregado a una cuenta. Registrar responsable y evidencia.
5. Reabrir la compra solo después de esa comprobación. La identidad borrada
   queda rechazada por Supabase en claim/complete/uncertain.

La apertura comercial exige asignar este procedimiento a soporte. Automatizar
el transporte, autenticación, retries y drenaje requiere un encargo propio.

## Evidencia reproducible

Desde raíz, en el Mac:
```sh
python3 supabase/tests/run-checkout-web-docker.py --output ~/evidence/web-compra/r3-docker
# Control RED esperado: sale con error, dos de tres aserciones fallan
python3 supabase/tests/run-checkout-web-docker.py --baseline --output ~/evidence/web-compra/r3-docker-red
deno test --cached-only --no-lock --node-modules-dir=none --config supabase/functions/deno.json --allow-env --allow-read --allow-write supabase/functions
```

El runner adquiere `~/orq/docker.lock`, usa un contenedor desechable sin red/puertos
y libera ambos en finally. Carga 69 migraciones: 137 pgTAP PASS y ocho carreras
reales app/web y claim/complete/uncertain frente a borrado, en ambos órdenes.
Observa el blocker advisory real; no usa un sleep como oráculo.
El esquema anterior admite dos compras: RED 1/3; la migración da GREEN 3/3.
No es un stack gestionado: bootstrap PostgreSQL/Storage sintético, rol postgres
superusuario solo en el contenedor fixture; ACL de clientes/service_role reales.

Edge: 617 PASS, 0 FAIL, dos ignored preexistentes (integraciones HTTP/SQL).
Fmt de los tres TS PASS; lint de producción PASS con la exclusión
`no-import-prefix` ya documentada en el repo. Los tests afectados conservan
ocho `require-await` de la base, sin diagnósticos nuevos; comparación guardada
en `~/evidence/web-compra/r3-lint-comparison.json`. No se presenta lint global verde.
Calidad 456 y superficie de deploy PASS. No Rust/telemetría: native no cambia.
Resultados y límites del E2E web→webhook→derechos en el expediente de la web.
