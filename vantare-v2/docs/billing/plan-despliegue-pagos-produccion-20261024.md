# Pagos: propuesta de despliegue en producción · VANTA-96 / #1772

Estado: **pendiente de autorización de Isaac**. Este documento no autoriza
ejecutar cambios. Inspección del 24-oct-2026 mediante GET y SELECT de solo lectura.
Proyecto exclusivo: `ombjshwzqgeisazijduq`. Base revisada:
`a37d0bcacd771eb7e83dd9e558b11dbe0912fe99` (nightly, #1771 integrado).
Antes de ejecutar se fijará el SHA aprobado que incluya el endurecimiento #1773;
no se usará un nightly móvil ni se desplegará toda la carpeta de funciones.

## Estado comprobado

- Producción tiene 97 versiones, exactamente las primeras 97 de las 98 de esta
  base. Sin versiones ajenas. Solo falta
  `20261024182517_isa_1770_terminal_checkout_attempts.sql`.
- Existen `resolution`, `billing_checkout_bindings` y el CHECK anterior validado.
  Los tres RPC que parchea la 98 coinciden, salvo espacios, con los cuerpos
  anteriores al ensayo aprobado de staging; cada anclaje aparece una sola vez.
  El helper nuevo no existe. El P2-1 de la review usaba la auditoría anterior
  a la reconstrucción y no describe esta producción.
- Hay 1 intento de checkout, 0 pedidos y 0 reembolsos; 4 ofertas de lanzamiento.
  No se han leído filas de clientes. La comparación es de versiones y contratos;
  los `statements` parseados del historial no son una copia binaria del fichero.
- Las 17 Edge están ACTIVE. El inventario externo adjunta versión, verify_jwt
  y SHA-256 `ezbr_sha256` de cada bundle. Supabase no expone su commit Git:
  no se atribuye un SHA Git sin prueba. `native-billing-checkout` v6 conserva
  `launch_scope_version: ""`; `billing-webhook` v38 conserva el verificador viejo.
  Se descargaron por API sus fuentes, por separado, para preparar reversión.
- Endpoint Polar producción `a03c8494-52dc-484c-bda8-26b47c542b18`, habilitado,
  API 2026-04, creado 9-jul: `format=raw` y
  **`uses_standard_webhook_signature=false`**. Raw describe el JSON, no la firma.
  El secreto tiene prefijo `whsec_` y sufijo Base64 de 32 bytes; su hash coincide
  con el secreto desplegado. **En este endpoint legacy se usa la cadena entera
  como UTF-8**, sin quitar prefijo ni decodificar. No se cambia ni rota el secreto.
  `POLAR_WEBHOOK_SECRET_FORMAT` todavía no está configurado.
- Marketing, IA y promoción de informes coinciden por hash con `false`.
  Compensación desactivada en ambos entornos. Worker `beta` sirve `vantare.app`;
  `PURCHASE_OPEN` está ausente (cerrado); `WAITLIST_OPEN=true` se conserva.
- El token backend no permite GET de endpoints (403); la credencial de lectura
  custodiada sí permite comprobar la firma. El GET de productos y descuentos de
  planes con esa credencial devuelve 403: **no se certifican todavía estados,
  precios ni ventanas remotos del catálogo**. Falta `products:read` y
  `discounts:read`, o revisión equivalente por Isaac en el panel.

Evidencia externa en `C:/VantareServer/evidence/supabase-reconstruccion/`:
`pagos-prod-20261024/supabase-readonly.json`, `migration-versions.json`,
`polar-webhook-readonly.json`, `polar-catalog-readonly.json`,
`cloudflare-flags-readonly.json` e inventario completo de funciones.
Fuentes de reversión en custodia restringida:
`secrets/backups/payments-prod-readonly-20261024/{nombre-funcion}/`.

## Endurecimiento antes de autorizar

El PR #1773 añade `SET LOCAL lock_timeout='5s'` al principio de la 98, sin
cambiar su lógica. Una prueba retiene ACCESS SHARE desde otra conexión y exige
55P03, ninguna modificación parcial y aplicación normal posterior; corre con
LF y CRLF en el arnés completo. El límite controla la espera, no cuánto dura
el bloqueo adquirido. La ejecución tendrá además `statement_timeout=30s`.

No se introduce NOT VALID + VALIDATE en la misma transacción: seguiría retenido
el ACCESS EXCLUSIVE hasta COMMIT. Separar transacciones cambiaría la atomicidad;
con 1 fila y ampliación de un CHECK ya satisfecho no compensa. Si el volumen o
las condiciones cambian, se detiene y se replantea antes de aplicar.
Se edita la 98 porque aún no está aplicada en producción: una 99 no protegería
su ejecución. En staging ya está aplicada la misma lógica; no se repite allí ni
se reescribe su historial para cambiar únicamente este ajuste de sesión.
Fundamento: [ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html).

## Secuencia propuesta, con la venta cerrada

1. **Congelar y copiar.** Tras autorización y CI verde del SHA elegido, volver
   a comprobar ref, pendientes, atributos, anclajes, flags y ausencia de pedidos
   inesperados. Si aparece otra migración, no incluirla automáticamente.
   Guardar dump completo nuevo, esquema y datos, incluyendo auth, private e
   historial, en `secrets/backups/` con ACL Administrators/SYSTEM. Usar `pg_dump
   --format=custom --file=<ruta-protegida>` con PGHOST/PGPORT/PGUSER/PGDATABASE,
   PGPASSWORD y SSL desde el proceso; sin URL ni contraseña en argv. Calcular
   SHA-256 y exigir `pg_restore --list` exitoso. Esto comprueba legibilidad, no
   una restauración íntegra. Exportar además los tres cuerpos/ACL de RPC, CHECK,
   fuentes aisladas y metadatos de las dos Edge y el estado previo del selector
   de firma. Custodiar una copia del secreto existente obtenida por GET privado
   si no hay env-file recuperable; no imprimirlo ni rotarlo.

2. **Aplicar solo la 98.** Inspeccionar bloqueos activos, sin matar sesiones.
   Generar offline un SQL protegido con el fichero canónico íntegro y un
   INSERT en `supabase_migrations.schema_migrations` inmediatamente antes de
   su COMMIT: versión `20261024182517`, nombre
   `isa_1770_terminal_checkout_attempts`, `statements` con el SQL canónico.
   Usar el mismo procedimiento transaccional de la reconstrucción: DDL e
   historial confirman juntos. Ejecutar por `psql -X -v ON_ERROR_STOP=1 -f
   <archivo-protegido>`; PGOPTIONS fija statement_timeout=30s y la migración
   fija lock_timeout=5s. No db reset, repair indiscriminado ni replay de las 97.
   Ante 55P03, error de anclaje o desconexión: parar; consultar historial y
   catálogo antes de cualquier reintento. Exigir 98/98, CHECK validado con
   revoked, helper privado sin EXECUTE para cliente/servicio y un solo parche
   por RPC. Confirmar mismos conteos: la migración no modifica compras.

3. **Actualizar checkout.** Desplegar solo `native-billing-checkout`, que contiene
   #1766 y también el diagnóstico #1732 del árbol aprobado. Isaac debe autorizar
   expresamente ese diagnóstico: no se sustituye a escondidas por un cherry-pick.
   `supabase functions deploy native-billing-checkout --project-ref
   ombjshwzqgeisazijduq --use-api --no-verify-jwt`, desde el SHA congelado;
   PAT solo en entorno. Registrar versión y hash devueltos. Sin otras Edge.

4. **Actualizar webhook.** Antes del deploy, cargar únicamente
   `POLAR_WEBHOOK_SECRET_FORMAT=legacy_utf8` con env-file protegido y
   `supabase secrets set --project-ref ombjshwzqgeisazijduq --env-file
   <archivo-protegido>`. Mantener POLAR_WEBHOOK_SECRET existente. Después
   desplegar solo `billing-webhook` desde el mismo SHA, `--use-api` y
   `--no-verify-jwt`. No cambiar endpoint, eventos ni modo de firma en Polar.
   No se despliega reconcile: los cambios de la 98 son SQL que ya invoca.
   Deploy API sin Docker: [guía Supabase](https://supabase.com/docs/guides/functions/quickstart).

5. **Verificar sin pagar.** Esperar propagación y comprobar cada versión/hash.
   Desde el panel Polar, enviar una prueba firmada de un evento no financiero
   como customer.updated, con datos sintéticos y sin pedido/suscripción/binding
   real. Revisar antes el payload: no reenviar un order.paid real. Exigir ACK
   **202**, registro durable e idempotencia al reentregar; estado ignored o
   quarantine según el evento, nunca una concesión Pro. Si no hay prueba no
   financiera disponible, parar y acordar alternativa; no inventar cobros.
   Una firma inválida debe dar 403 sin persistencia. Verificar después un ciclo
   normal del cron reconcile, sin activar compensación ni enviar Owner sintético.
   Con la cuenta QA custodiada, bridge → PostgREST/RLS → native-license 200 y
   firma Ed25519 verificable con la pública del instalador. Mantener su nivel
   real: **no conceder Pro para simular una compra**.
   Finalmente solicitar un checkout standard Pro mensual por la Edge nativa:
   esperar **200**, URL de Polar correcta y cantidad/moneda esperadas; custodiar
   la URL, no pagar y dejar caducar. Si la cuenta tiene un intento abierto, usar
   su reintento idempotente o esperar expiración por código; ningún UPDATE manual.
   Ante 422, revisar solo diagnóstico sanitizado. Sin prueba de catálogo no se
   promete este 200. Confirmar 0 nuevos pedidos/reembolsos/grants, venta cerrada
   y web/login/lista intactos. El E2E económico, concesión y retirada de Pro ya
   está acreditado en sandbox (#1771); este ensayo de producción no lo repite.

## Reversión y paradas

| Paso | Reversión propuesta |
| --- | --- |
| Copia/preflight | Sin cambio remoto. Si no hay copia legible, no continuar. |
| 98 falla | ROLLBACK de DDL e historial; comprobar 97 y definiciones anteriores. No repair para aparentar éxito. |
| 98 confirma y hay que revertir código | Aplicar, solo con autorización de esa contingencia, una migración compensatoria nueva que restaure las tres definiciones guardadas y quite el helper después. Conservar CHECK ampliado y filas terminales; no reabrir intentos ni borrar historia. Volver al CHECK anterior solo si no hay revoked y hay necesidad revisada. No eliminar la entrada 98 ni restaurar masivamente el dump. |
| Checkout nuevo falla | Redesplegar únicamente la fuente aislada guardada de checkout, verify_jwt=false. Vuelve también su bug previo: la venta permanece cerrada. Comparar fuente y metadatos; un rebundle puede tener otro hash. |
| Webhook nuevo falla | Primero redesplegar únicamente la fuente aislada anterior de webhook, verify_jwt=false; después retirar el selector legacy_utf8 si estaba ausente antes. Nunca quitar el selector dejando el verificador nuevo: interpretaría mal el secreto. No rotar el secreto ni alterar el endpoint. Conservar inbox y reentregar desde Polar los eventos fallidos tras recuperar el receptor. |
| Checkout QA sin pagar | Dejar expirar; no cobrar, reembolsar ni borrar ledger. |

Parar ante datos nuevos inesperados, otras pendientes, drift de RPC, locks que
no se adquieren, secreto no coincidente, firma rechazada o degradación de
servicio. Mantener venta cerrada y explicar el estado. Una restauración total
del dump es recuperación de desastre, con revisión/autorización aparte; podría
perder eventos posteriores. Nunca se desactiva RLS.

## Apertura comercial: otra decisión de Isaac

El despliegue técnico anterior **no abre la venta**. Antes de abrir:

- Revisar en Polar producción productos/precios activos, moneda/importe y
  descuentos/ventanas, usando `products:read` y `discounts:read`. No publicar ni
  desarchivar productos sin autorización. Mantener el mapa canónico y Launch
  histórico inactive; Founders conserva su doble llave. Verificar las cuatro
  ofertas SQL contra el mapa: 26-oct-2026 19:00 Madrid → 26-nov 19:00 Madrid
  (18:00Z en ambos extremos), sin adelantar artificialmente la fecha.
- Para la web de compra hace falta aprobar y publicar su código separado:
  el Worker beta vigente es landing/login/lista, y activar una variable no le
  añade el checkout. En ese build: `VANTARE_PURCHASE=open`; en el Worker de
  compra: `PURCHASE_OPEN=true`. Ahora ambas rutas de compra permanecen cerradas.
  El secreto/variable de cierre web no es un kill switch del endpoint nativo:
  una llamada QA directa puede crear checkout sin abrir la UI pública.
- Validar nombres requeridos del futuro Worker: CLERK_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY, POLAR_ACCESS_TOKEN, POLAR_PRODUCT_MAP,
  PURCHASE_RATE_SALT, PURCHASE_ERASURE_SALT, PURCHASE_ERASURE_ACK_SECRET,
  D1_ERASURE_JWT; configuración pública CLERK_DOMAIN, CLERK_PUBLISHABLE_KEY,
  SUPABASE_URL, SUPABASE_PUBLIC_KEY, POLAR_ENVIRONMENT=production,
  CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL. Verificar bindings/migraciones D1,
  rotación del JWT corto y cron según el runbook de web-compra antes de publicar.
  Los valores existentes se reutilizan, no se inventan ni se piden por chat.
- Confirmar receptor Owner/email y cron sanos, instalador con URL bridge y
  públicas correctas, y build/catálogo que muestra los planes aprobados.
  Marketing e IA siguen false y compensación OFF: no son requisito de apertura
  ni se activan como efecto secundario. La excepción legal de login/lista no
  autoriza por sí sola abrir compra; Isaac decide datos legales/excepción para
  compra, condiciones, planes, precios, fecha y canal web/app.

Isaac debe autorizar **el SHA técnico final, la copia+98, las dos Edge con
diagnóstico #1732, el selector legacy_utf8 sin rotación y las pruebas sin pago**,
incluida la reversión de código descrita si fallan. La apertura comercial,
publicación web-compra, cambios de catálogo y cualquier compra real quedan fuera
de esa autorización. No falta una clave nueva de webhook: sí falta acceso de
lectura al catálogo o que Isaac certifique sus estados desde el panel.
