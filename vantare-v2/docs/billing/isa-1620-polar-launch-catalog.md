# #1620 — catálogo Polar de lanzamiento (ronda 3)

Issue [#1620](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1620),
PR draft [#1621](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1621),
GitHub Project Vantare, área Billing/licencias. Sustituye #1499/PR #1500.
VANTA-N inexistente: el encargo de ronda 3 autoriza omitir Plane; no se crea
ni se actualiza Notion (VAN-782 es histórico).

Decisión del orquestador de 14/10/2026: lanzamiento usa **productos propios
con precio base**, no descuentos. Un descuento porcentual por creador, código
con su nombre exacto, limitado a esos productos. Solo preparación en repo:
sin API Polar, secretos, deploy, activación ni venta probados.

## Nombres y descripciones de cliente (14/10/2026)

El script crea las suscripciones con `Vantare Pro` o `Vantare Pro Plus`;
las de lanzamiento añaden ` · Precio de lanzamiento`. Polar muestra el
intervalo mensual/anual junto al precio. Las claves técnicas permanecen en
metadata y en el mapa, nunca en el nombre visible. Las descripciones breves
Markdown proceden de [product-contract.md](../vantare-program/product-contract.md):
Stable y Discord para Pro; todo Pro más Nightly/Beta privada, tests, encuestas
y previews para Plus, con los mismos derechos para normales y lanzamiento.

La Launch Edition ya configurada se presenta como `Vantare Launch Edition`:
módulos existentes al comprar y mejoras de por vida, Engineer inicial,
Testers sin Nightly y advertencia de que módulos nuevos pueden venderse aparte.
No se crea ni se sustituye esa edición, ni se modifica su precio de pago único.
Su ausencia, duplicidad por metadata, archivo o intervalo recurrente abortan
el preflight antes de cualquier escritura.

Los existentes se corrigen idempotentemente con PATCH **solo** de `name` y
`description`, separado del reconciliador de precios ya existente. No se
mandan precios, metadata, visibilidad, trial, beneficios ni suscripciones en
el PATCH cosmético. Los IDs e historial se conservan; un rerun sin cambios
escribe cero. El plan offline incluye ambos textos para revisión.

Polar acepta una cadena por `name`/`description`, sin campos de traducción por
idioma en [Product Update](https://polar.sh/docs/api-reference/2026-10/products/update-product).
Se usa ES; la localización del formulario de checkout es independiente.
Los tests usan HTTP inyectado sin red: no certifican el aspecto del checkout
real. El orquestador debe revisar/aplicar en sandbox por su vía autorizada y
comprobar los nueve nombres, Markdown, mensual/anual y conservación de IDs.

La investigación de logo, medias, tema, color, textos, campos, idioma y
dominio propio está en [personalización Polar](isa-1620-polar-checkout-personalizacion.md)
y en `~/orq/polar-checkout-personalizacion.md`. Logo, imágenes, beta de
localización y eventual embed son pasos del operador; no se ejecutan aquí.

## Tabla y duración

Fuente: `supabase/functions/scripts/polar-launch-prices.json`, versión
`isa-1620-launch-v2`. EUR con IVA incluido, céntimos enteros.

| Plan | Normal | Lanzamiento | Creador durante 2 meses | Base después del descuento |
|---|---:|---:|---:|---:|
| Pro mensual | 5,99 € | 3,99 € | 3,19 € | 3,99 € |
| Pro anual | 59,90 € | 39,90 € | 31,92 € | 39,90 € |
| Pro Plus mensual | 9,99 € | 6,99 € | 5,59 € | 6,99 € |
| Pro Plus anual | 99,90 € | 69,90 € | 55,92 € | 69,90 € |

Los cuatro importes base están decididos en este encargo: se retira el antiguo
gate `--confirm-annual-launch`. Se conservan cuatro productos normales y se
crean otros cuatro de lanzamiento. Launch Edition vitalicia de 30 € es otro
producto: su precio queda fuera; el encargo de nombres del 14/10 corrige
únicamente su nombre y descripción. No se migran suscripciones.

`--creator ISAAC` crea **un** descuento `code: ISAAC`, `type: percentage`,
`basis_points: 2000`, `duration: repeating`, `duration_in_months: 2`, con
`products` igual a los cuatro IDs de lanzamiento. Sin sufijos ni rebajas fijas
compuestas ni stacking. Preserva la escritura recibida, también `Isaac`.
El operador admite códigos alfanuméricos de 3–32 caracteres; no convierte
nombres con espacios ni inventa alias. Colisiones sin distinguir mayúsculas
abortan antes de mutar.

Mes 3 mensual: termina el −20 % y se paga **la base de lanzamiento**, no la
normal. En anual, 2 meses es duración calendario, no dos facturas anuales:
primera factura rebajada, renovación a 39,90/69,90 €. No se promete una segunda
factura anual rebajada. **Decisión B de Isaac (14/10/2026, tras compra sandbox):
ningún producto de lanzamiento tiene prueba gratis**, tampoco por enlace/código
de creador. Los siete días quedan solo para Pro a precio normal, mensual/anual;
Plus normal tampoco tiene trial. Sustituye la decisión anterior de heredarlo
en Pro lanzamiento. Validar fechas/antiabuso del Pro normal en sandbox.

Comisión contable sobre lo que paga el cliente: 30 % mes 1, 10 % meses 2–12
mientras siga suscrito; renegociar después. `creator_commission` conserva ambos
tramos, base y `automatic_payouts: false`. No se envía como payout a Polar.

## Enlaces y fin del mes

Cada creador tiene un Checkout Link propio con los cuatro productos de
lanzamiento y su único `discount_id`. `allow_discount_codes: false` fija el
creador del enlace. El código exacto también sirve en un checkout de esos
productos que admita códigos; no sirve en normales ni Launch Edition. La
salida exporta solo ID/URL/código del enlace, nunca el `client_secret`.
La URL exportada fija `theme=dark` y conserva el resto de query y fragmento.
No manda un campo `theme` a Polar ni modifica el enlace persistido: ese campo
no existe en el payload de Checkout Links. Distribuir la URL de salida; los
enlaces antiguos sin parámetro conservan su tema anterior.
[Parámetro oficial](https://polar.sh/docs/features/checkout/links).

El enlace compartido debe tener `trial_interval` y `trial_interval_count`
ausentes o null: hereda los cuatro productos de lanzamiento **sin trial**.
Cualquier override, incluso siete días o un campo aislado, aborta el preflight
antes de escribir. No se corrige el enlace automáticamente; revisar y retirar el
override en un paso autorizado antes de reintentar. La misma validación
comprueba la respuesta al crear el enlace.
Fuente: [prioridad del trial del checkout sobre el producto](https://github.com/polarsource/polar/blob/71ea1871ce9d3e7bada94d0e1e4f66f91d1e7b59/server/polar/models/checkout.py#L475).

### Quitar el trial de lanzamiento existente (decisión B)

Los POST de lanzamiento omiten ambos campos de trial. Los productos de
lanzamiento existentes con cualquiera de esos campos informado, incluso
una configuración parcial, reciben un PATCH separado con
`{"trial_interval": null, "trial_interval_count": null}`. No envía precios,
metadata, visibilidad, beneficios ni suscripciones; mantiene IDs e historial.
Pro normal conserva la comprobación de siete días del mapa. La configuración
`trial` del mapa describe el producto normal; no autoriza trial en su ID de
lanzamiento. [Product Update admite ambos campos null](https://polar.sh/docs/api-reference/2026-10/products/update-product).

Se usa el mismo apply, con o sin `--creator`; no hace falta retirar ni recrear
productos/descuentos/enlaces. El preflight general mantiene sus guardas antes
de mutar y admite el trial de lanzamiento como desvío reparable.
Tras reconciliar los productos, el preflight del enlace exige que **los cuatro**
queden sin trial antes de crear descuento/enlace o devolver un enlace existente.
Verifica también cada respuesta de POST/PATCH, y el ID/organización del PATCH
de trial: si queda cualquier campo, aborta sin entregar una salida de éxito.
Pueden haberse confirmado PATCH anteriores: inspeccionar y repetir con el mapa
guardado; una reparación confirmada con respuesta perdida no se repite. Un
rerun ya corregido escribe cero (salvo el enlace pendiente de publicación).

Operación posterior, solo por vía autorizada del orquestador: guardar el mapa
observado y ejecutar apply con salida nueva, comprobar ambos campos vacíos en
los cuatro productos y en el enlace, IDs/precios intactos y rerun sin escrituras.
Abrir de nuevo el enlace de creador y verificar que cobra **hoy** 3,19/5,59 EUR
en mensual o 31,92/55,92 EUR en anual, sin «0 EUR hoy» ni siete días gratis.
Verificar aparte Pro normal con siete días y Plus normal sin trial. Los checkouts
o suscripciones iniciados antes del cambio no se migran ni se cancela su trial:
revisarlos por separado, sin modificar compras existentes automáticamente.

### Cambios de plan con descuento de creador (R1 P2 Sol A)

El scope limita la aplicación inicial del código. Polar conserva un descuento
ya asociado al cambiar de producto; no garantiza su retirada al salir de
lanzamiento. Antes de aplicar/publicar ofertas de creador, el operador debe
deshabilitar cambios de plan del portal en un paso autorizado:
`customer_portal_settings.subscription.update_plan: false`. El script comprueba
ese valor mediante GET de la organización y aborta antes de escribir si está
habilitado, falta, no es booleano o la organización no coincide. También lo
exige sin `--creator` si ya existen descuentos con metadata `creator:*`.
No cambia ajustes de organización automáticamente. Este bloqueo es global
para los cambios de plan del portal, incluidos planes sin código.

Mantener ese ajuste mientras se distribuyan ofertas de creador. El operador
debe **bloquear todo cambio de producto por Dashboard/API administrativa mientras
el descuento de creador esté vigente**, incluidos cambios programados. Antes
de distribuir enlaces, revisar que no haya transiciones ya programadas en esas
suscripciones. Después de su vencimiento, verificar que ninguna transición
retenga/aplique descuento antes de permitir el cambio. Este catálogo no cambia
suscripciones ni controla una API administrativa usada fuera del procedimiento.
No basta con el scope ni con inspeccionar un webhook después del cobro.

Fuentes oficiales: [portal y su guarda](https://github.com/polarsource/polar/blob/main/server/polar/customer_portal/service/subscription.py),
[ajuste de organización](https://github.com/polarsource/polar/blob/main/server/polar/models/organization.py),
[descuento heredado](https://github.com/polarsource/polar/blob/main/server/polar/models/subscription_update.py).
Sandbox posterior debe demostrar portal bloqueado y ausencia de cambios
administrativos/programados con descuento activo; esta ronda no configura Polar.

Durante el mes la web muestra lanzamiento. Al terminar, **retirar sus precios,
botones y enlaces generales de la web**, conservar productos en Polar y
mantener solo la distribución por enlaces de creador. No archivarlos ni
caducar códigos: siguen disponibles para nuevas altas y renovaciones.
`distribution` en tabla, plan y salida declara ambas fases. Fecha exacta y
cambio/publicación web pendientes en su entrega autorizada; este repo no
publica la web ni un temporizador. Checkout app conserva productos normales.

«Solo por enlace» es distribución, no una barrera de acceso: un enlace puede
reenviarse. DUDA si se exige impedir técnicamente cualquier otra entrada;
alternativa mínima: quitar de la web los accesos generales y distribuir
únicamente los enlaces de creador. No se afirma exclusividad técnica.

### Límite Polar: draft

DUDA técnica registrada en buzón: Polar rechaza crear Checkout Links con
productos draft. Alternativa mínima implementada: dos etapas con el mismo
comando. Primera: productos draft + descuento; resultado `creator_link: null`
y `creator_link_pending: publish_launch_products_then_rerun`. Después de la
activación autorizada de los cuatro productos de lanzamiento, repetir con el
resultado anterior crea el enlace. Otro rerun da `writes: 0`. El script nunca
publica productos automáticamente.

Visibilidades reales: `draft`, `public`, `private`. La etapa de enlace acepta
los cuatro productos en `public` o `private`; un solo draft mantiene el enlace
pendiente. `published` no es un valor de la API (R1 P1 Sol A/B, RED→GREEN).

Fuentes públicas oficiales contrastadas el 14/10/2026, sin API:
[descuento porcentual/repeating](https://github.com/polarsource/polar/blob/main/server/polar/discount/schemas.py),
[payload Checkout Links](https://github.com/polarsource/polar/blob/main/server/polar/checkout_link/schemas.py),
[rechazo de draft en `_get_validated_products`](https://github.com/polarsource/polar/blob/main/server/polar/checkout_link/service.py),
[discount_id y códigos](https://polar.sh/docs/api-reference/2026-10/checkout-links/create-checkout-link).

## Mapa y recuperación

`polar_product_id` sigue normal. El opcional `polar_launch_product_id` declara
su producto de lanzamiento; ambos UUIDs distintos tienen inverso estricto a
la misma clave y derechos. Loader rechaza IDs extra, inversos ausentes/conflictivos
y este campo en `launch_lifetime`. Webhook reconoce ambos sin SKU/SQL nuevos.
`polar_price_ids` conserva normales y lanzamiento, activos/archivados observados
antes de PATCH, históricos de entrada y nuevo precio. Snapshot sandbox sin
IDs inventados; solo se actualizará tras observación real.

R1 P2 Sol B: antes de cualquier escritura, si un producto necesita PATCH de
precio y tiene IDs observados ausentes del mapa de entrada, el script aborta.
Guardar primero esos IDs en un **nuevo mapa durable**: añadir cada ID observado
al `checkout_keys[clave].polar_price_ids` y a `price_id_to_checkout_key` con
la misma clave, sin retirar históricos ni cambiar sus propietarios. Si el
producto se recuperó por metadata, guardar también su configuración/ID y el
inverso de producto. Validar ese mapa con el loader y usarlo como `--map` en
el siguiente apply; no basta con conservar IDs solo en memoria. Este paso es
preparación operativa posterior, no una llamada real en esta ronda.

Un PATCH puede quedar confirmado en Polar aunque llegue timeout al cliente;
GET posterior puede mostrar solo el nuevo precio y omitir el archivado.
Reintentar con el mapa previamente guardado conserva el precio anterior,
el observado y el nuevo. El script no muta el objeto de entrada. Sin registro
durable no permite ese PATCH, incluso si afecta al último plan. Nuevos POST
siguen recuperables por metadata; concurrencia ajena queda fuera del contrato
de un solo operador. No se recupera retrospectivamente un histórico ya perdido
por ejecuciones anteriores: inspección autorizada de suscripciones/precios.

Preflight antes de mutar: entorno/organización, intervalos/trials normales, duplicados
paginados, propiedad de precios, duración/porcentaje/ámbito y enlace. Si hay
descuentos v1 de lanzamiento/creador compuesto, aborta para revisión manual;
no los modifica ni borra. Metadata permite recuperar ejecuciones parciales.
Un solo operador por organización; no garantiza concurrencia.

## Comandos desde raíz Git (PowerShell)

Solo se soportan **tokens de organización**; los tokens personales no están
soportados ni se detectan por prefijos. Ningún POST de productos, descuentos
o checkout links envía `organization_id`: la organización procede del token.
El GET de organización comprueba siempre el ID esperado antes de mutar,
también sin ofertas de creador. La guarda del portal se conserva cuando aplica.

Token solo mediante `POLAR_ACCESS_TOKEN` en sesión privada del operador, nunca
argumentos/archivos/logs. Offline no lee tokens. Scopes posteriores: products,
discounts y checkout_links read/write, y organizations:read para verificar la
identidad de organización y la guarda del portal. Header `Polar-Version: 2026-10`.
Entrada y salida distintas; salida inexistente. Se comprueba antes de HTTP
y se crea exclusivamente al terminar la sincronización con éxito; un fallo
HTTP no deja archivo, y un fallo de escritura retira su salida incompleta.
Hace falta permiso de lectura también sobre la ruta de salida para el preflight.
Una salida existente nunca se sobrescribe, aunque esté vacía. Para recuperar el
archivo de 0 bytes de la versión anterior, usar otra ruta o retirar ese archivo
solo tras comprobar que es la salida vacía fallida. No garantiza persistencia
ante terminación forzosa del proceso durante la escritura.
Los `--apply` están preparados,
**no ejecutados** en esta ronda.

Planes offline sin permisos ni red:

```powershell
deno run --no-lock supabase/functions/scripts/polar-launch-catalog.ts --environment sandbox --creator ISAAC
deno run --no-lock supabase/functions/scripts/polar-launch-catalog.ts --environment production --creator ISAAC
```

Sandbox etapa 1, draft y descuento:

```powershell
deno run --no-lock --allow-env=POLAR_ACCESS_TOKEN --allow-read=supabase/functions/scripts/polar-product-map.sandbox.json,C:/tmp/1620-sandbox-r3-draft.json --allow-write=C:/tmp/1620-sandbox-r3-draft.json --allow-net=sandbox-api.polar.sh supabase/functions/scripts/polar-launch-catalog.ts --environment sandbox --map supabase/functions/scripts/polar-product-map.sandbox.json --output C:/tmp/1620-sandbox-r3-draft.json --creator ISAAC --apply
```

Después de verificar IDs/precios, desplegar runtime/mapping por el pipeline
autorizado y activar los cuatro productos de lanzamiento; etapa 2, enlace:

```powershell
deno run --no-lock --allow-env=POLAR_ACCESS_TOKEN --allow-read=C:/tmp/1620-sandbox-r3-draft.json,C:/tmp/1620-sandbox-r3-links.json --allow-write=C:/tmp/1620-sandbox-r3-links.json --allow-net=sandbox-api.polar.sh supabase/functions/scripts/polar-launch-catalog.ts --environment sandbox --map C:/tmp/1620-sandbox-r3-draft.json --output C:/tmp/1620-sandbox-r3-links.json --creator ISAAC --apply
```

Idempotencia después del enlace, debe dar `writes: 0`:

```powershell
deno run --no-lock --allow-env=POLAR_ACCESS_TOKEN --allow-read=C:/tmp/1620-sandbox-r3-links.json,C:/tmp/1620-sandbox-r3-rerun.json --allow-write=C:/tmp/1620-sandbox-r3-rerun.json --allow-net=sandbox-api.polar.sh supabase/functions/scripts/polar-launch-catalog.ts --environment sandbox --map C:/tmp/1620-sandbox-r3-links.json --output C:/tmp/1620-sandbox-r3-rerun.json --creator ISAAC --apply
```

Otro creador: entrada del último resultado, otra salida nueva y `--creator MARIA`;
reutiliza productos, crea solo su descuento/enlace.

Producción tras sandbox y OK final de Isaac; mapa propio con IDs reales de esa
organización y `environment: production`, nunca IDs sandbox:

```powershell
deno run --no-lock --allow-env=POLAR_ACCESS_TOKEN --allow-read=C:/tmp/1620-production-map.json,C:/tmp/1620-production-r3-draft.json --allow-write=C:/tmp/1620-production-r3-draft.json --allow-net=api.polar.sh supabase/functions/scripts/polar-launch-catalog.ts --environment production --map C:/tmp/1620-production-map.json --output C:/tmp/1620-production-r3-draft.json --creator ISAAC --apply --confirm-production
```

Tras activar los cuatro productos de lanzamiento en paso autorizado:

```powershell
deno run --no-lock --allow-env=POLAR_ACCESS_TOKEN --allow-read=C:/tmp/1620-production-r3-draft.json,C:/tmp/1620-production-r3-links.json --allow-write=C:/tmp/1620-production-r3-links.json --allow-net=api.polar.sh supabase/functions/scripts/polar-launch-catalog.ts --environment production --map C:/tmp/1620-production-r3-draft.json --output C:/tmp/1620-production-r3-links.json --creator ISAAC --apply --confirm-production
```

## Verificación manual y rollback (posteriores, autorizados)

Extraer `map` para `POLAR_PRODUCT_MAP`; no cargar resultado entero. Antes de
vender Plus anual, aplicar también la migración ya preparada
`20261014095626_billing_checkout_pro_plus_annual.sql` y desplegar el runtime
que reconoce `polar_launch_product_id`. Checkout app no selecciona lanzamiento
ni autoaplica creador. Links no sustituyen atribución de identidad: comprobar
compra identificada/grant según #1514/#1506; no se levanta su no-go comercial.

Sandbox: cuatro normales y cuatro lanzamiento; código exacto y segundo
creador; scope restringido; enlace fijo; facturas mensuales 1/2 rebajadas y
mes 3 a 3,99/6,99; primera anual rebajada y renovación 39,90/69,90; trial/antiabuso,
enlace sin override y cuatro productos de lanzamiento sin trial (cobro hoy);
Pro normal siete días y Plus normal sin trial,
cancelación/refund, derechos/canales, entorno, histórico y rerun cero escrituras.
Al fin de mes: web sin ofertas generales de lanzamiento y enlaces de creador
operativos, productos conservados. Fixtures no prueban facturas reales.

Rollback de nuevas altas: retirar enlaces y caducar descuento solo autorizado;
conservar productos/mapas para suscripciones vigentes. Archivar productos solo
tras revisar su efecto. No borrar IDs ni revertir SQL con filas existentes.
Timeout puede dejar escrituras parciales: inspeccionar y recuperar por metadata,
sin POST ciegos ni imprimir cuerpos HTTP/client_secret. En errores 4xx, el
script muestra exclusivamente `type`, `loc` y `msg` de validaciones Polar
(`detail` o validación directa). Omite input, ctx y headers, y sustituye el
token de la sesión por `[REDACTED]` si aparece en esos campos. JSON ilegible,
validación no reconocida y errores 5xx mantienen el mensaje genérico.

## Evidencia y canal

Respuesta R1 independiente: P1 Sol A/B, P2 Sol A y P2 Sol B confirmados y
corregidos con un commit por hallazgo único; Muse no completa una review.
Siete regresiones RED→GREEN y control draft; catálogo 29 PASS, suite completa
566 PASS/0 FAIL/1 ignorado. Tipos/lint/fmt, quality 456, planes offline y diff
PASS; deploy surface PASS tras retirar solo node_modules generado por tests
(preview Git; Remove-Item rechazado automáticamente, limpieza Git permitida).
Logs `C:/tmp/polar-loop/r1-*`, respuesta/HEAD y estado remoto en
`C:/tmp/polar-loop/r1-respuesta.md` y comentario de entrega #1620/#1621.
pgTAP/Rust/UI/telemetría omitidos por las razones anteriores; no API, secretos,
deploy, merge ni publicación. El bloqueo administrativo es un procedimiento
operativo, no control técnico de llamadas fuera del catálogo.

Ronda 3: cuatro regresiones P2-2 RED→GREEN; tests adicionales de scope/drift,
sin creador, recuperación, draft→activación→enlace; webhook de alta, renovación
y cancelación en cuatro planes con mismos derechos. Logs `C:/tmp/ola2/1620-r3-*`.
Tipos/encoding/ruta intermedios corregidos sin saltar checks; gates finales y
HEAD/push/CI en comentario de entrega y buzón. Ronda 2 conserva evidencia
histórica de P1-1/P2-1/P2-3.

Suite final Deno: **558 PASS, 0 FAIL, 1 ignorado**; catálogo 21 PASS.
Check/lint/fmt, quality 456 huellas, superficie deploy y diff PASS. La suite
generó node_modules; preview Git confirmó solo esa ruta, retirada con Git
tras rechazo automático del comando PowerShell, superficie repetida PASS.

pgTAP omitido: sin Docker/psql, SQL intacto en ronda 3. Rust/UI y telemetría
nativa omitidos sin cambios. Sin API Polar, secretos, deploy, merge/promoción,
release, pagos ni gasto. Revisión independiente y sandbox real pendientes.
