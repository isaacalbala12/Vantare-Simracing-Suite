# #1620 — catálogo Polar de lanzamiento

[Tarea Notion VAN-782](https://app.notion.com/p/3f9e51695c6581229de0e11deabcd9ab),
proyecto Billing y licencias. Sustituye el procedimiento de [PR #1500](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1500)
/ [#1499](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1499).
Solo preparación en repo: **ninguna ejecución en Polar, deploy ni venta probados**.

## Tabla y modelo

Fuente ejecutable: `supabase/functions/scripts/polar-launch-prices.json`.
EUR, IVA incluido; importes enteros en céntimos.

| Plan | Normal | Lanzamiento | Con creador | Descuento lanzamiento / creador sobre normal |
|---|---:|---:|---:|---:|
| Pro mensual | 5,99 € | 3,99 € | 3,19 € | 2,00 € / 2,80 € |
| Pro anual | 59,90 € | 39,90 € pendiente | 31,92 € pendiente | 20,00 € / 27,98 € |
| Pro Plus mensual | 9,99 € | 6,99 € | 5,59 € | 3,00 € / 4,40 € |
| Pro Plus anual | 99,90 € | 69,90 € pendiente | 55,92 € pendiente | 30,00 € / 43,98 € |

Se conserva un producto por plan/ciclo y un precio normal activo. Se crean
descuentos **fijos** por producto: sin código para lanzamiento, y con código
para el importe compuesto lanzamiento + 20 % adicional del creador. Así no
hace falta acumular dos descuentos, duplicar productos de lanzamiento ni
aproximar 5,99 → 3,99 mediante porcentajes. Redondeo de `lanzamiento × 0,8`
al céntimo más cercano; 3,192 → 3,19 y 5,592 → 5,59.

Polar admite descuentos fijos, alcance por producto y aplicación automática
por Checkout Link/API: [documentación](https://polar.sh/docs/features/discounts)
y [API 2026-10](https://polar.sh/docs/api-reference/2026-10/discounts/create-discount).
El script fija `Polar-Version: 2026-10`, conforme a su
[contrato de versiones](https://polar.sh/docs/api-reference/2026-10/versioning).

Decisión confirmada en el último comentario de #1620: el descuento compuesto
de creador usa `duration: repeating`, `duration_in_months: 2`. Pro cobra 3,19 €
y Plus 5,59 € los meses 1 y 2, tanto durante como fuera del lanzamiento;
desde el mes 3 vuelve el precio normal de 5,99/9,99 €. No hay stacking.
El descuento de lanzamiento sin creador conserva `duration: forever`.
La duración individual de creador no depende de una fecha de fin de campaña.
Descuentos existentes con otra duración abortan como drift antes de escribir;
requieren revisión manual, no una sustitución automática sobre suscripciones.
Los importes anuales siguen pendientes de confirmación.

`--creator ISAAC` genera códigos alfanuméricos por plan: `ISAACPROM`,
`ISAACPROA`, `ISAACPLUSM`, `ISAACPLUSA`. Cada código pertenece a un solo
producto y concede ya el total combinado. Un código único transversal requeriría
otra estrategia: los importes relativos difieren entre Pro y Plus. Añadir otro
creador requiere otra ejecución con su prefijo; se conservan los anteriores.

La comisión del **30 %** es solo dato contable (`creator_commission_basis_points`)
en la tabla y resultado. No se crean payouts, cuentas afiliadas, split de cobros
ni gastos. La base de liquidación, IVA, comisiones Polar, refunds y atribución
deben acordarse por separado; el dato no demuestra soporte automático de Polar.
Si se calcula un 30 % sobre lo efectivamente cobrado, `0,8 × 0,7 = 0,56`:
queda 56 % del lanzamiento antes de impuestos y fees (reducción combinada 44 %,
no una suma de porcentajes). No se implementa esa liquidación.

## Qué hace el script y qué conserva

`polar-launch-catalog.ts` usa Deno y API HTTP sin nuevas dependencias.
Sin `--apply` solo muestra la tabla: **cero permisos de entorno/red/lectura**.
Con apply lee un mapa de IDs no secreto, valida entorno/organización y lista
todas las páginas de productos y descuentos antes de mutar. No localiza por
nombres. Reutiliza IDs configurados o metadata `vantare_checkout_key`; los
descuentos usan `vantare_offer_key`. Duplicados, IDs ausentes, ciclos inválidos,
códigos de otro propietario y descuentos divergentes abortan antes de escribir.
No se reintenta automáticamente ninguna petición.

El snapshot sandbox real existente se conserva: Launch 30 €, Pro mensual y
anual con trials de siete días de nightly. No se inventan UUIDs de Pro Plus ni
evidencia Polar. Los productos nuevos se crean con visibilidad **draft**, sin
trial. Pro Plus anual tiene las mismas capabilities/canales que su mensual;
no se modifica auth, identidad, licencias ni el UUID comercial (ADR 0100).

El resultado incluye `map`, `offers`, `writes`, `pending` y el dato de comisión.
`map` conserva todos los price IDs históricos aunque el precio activo se
sustituya. Los suscriptores existentes no se migran. Segunda ejecución con
el resultado guardado como entrada: mismos IDs, `writes: 0`. La salida se abre
con `createNew`: una ruta ya existente se rechaza antes de llamar a Polar.

Los anuales normales se preparan siempre; sus descuentos de lanzamiento y
creador requieren `--confirm-annual-launch`, solo tras confirmar ambos importes.
Sin él, aparecen en `pending` y no se crean descuentos anuales.

## Comandos exactos para Isaac

Desde la **raíz Git**, no desde `vantare-v2`. Token cargado en una sesión privada
como `POLAR_ACCESS_TOKEN`; nunca en argumentos, ficheros, chat ni logs. Scopes:
`products:read`, `products:write`, `discounts:read`, `discounts:write`.
Un solo operador por organización; no ejecutar dos sincronizaciones simultáneas.

Plan sandbox o producción sin token y sin red:

```powershell
deno run --no-lock supabase/functions/scripts/polar-launch-catalog.ts --environment sandbox --creator ISAAC
deno run --no-lock supabase/functions/scripts/polar-launch-catalog.ts --environment production --creator ISAAC
```

Sandbox real (sin aplicar aún los descuentos anuales pendientes):

```powershell
deno run --no-lock --allow-env=POLAR_ACCESS_TOKEN --allow-read=supabase/functions/scripts/polar-product-map.sandbox.json --allow-write=C:/tmp/1620-sandbox-result.json --allow-net=sandbox-api.polar.sh supabase/functions/scripts/polar-launch-catalog.ts --environment sandbox --map supabase/functions/scripts/polar-product-map.sandbox.json --output C:/tmp/1620-sandbox-result.json --creator ISAAC --apply
```

Después de confirmar anuales, añadir sus descuentos usando el resultado anterior:

```powershell
deno run --no-lock --allow-env=POLAR_ACCESS_TOKEN --allow-read=C:/tmp/1620-sandbox-result.json --allow-write=C:/tmp/1620-sandbox-confirmed.json --allow-net=sandbox-api.polar.sh supabase/functions/scripts/polar-launch-catalog.ts --environment sandbox --map C:/tmp/1620-sandbox-result.json --output C:/tmp/1620-sandbox-confirmed.json --creator ISAAC --apply --confirm-annual-launch
```

Idempotencia, misma entrada y otra salida nueva (debe mostrar `writes: 0`):

```powershell
deno run --no-lock --allow-env=POLAR_ACCESS_TOKEN --allow-read=C:/tmp/1620-sandbox-confirmed.json --allow-write=C:/tmp/1620-sandbox-rerun.json --allow-net=sandbox-api.polar.sh supabase/functions/scripts/polar-launch-catalog.ts --environment sandbox --map C:/tmp/1620-sandbox-confirmed.json --output C:/tmp/1620-sandbox-rerun.json --creator ISAAC --apply --confirm-annual-launch
```

Producción: preparar **C:/tmp/1620-production-map.json** con el mapa de IDs reales
de esa organización, `environment: production`, incluyendo los vínculos
históricos de Launch/Pro. No reutilizar IDs sandbox. Tras validar sandbox y recibir
el OK final de Isaac, usar su token de producción en sesión privada:

```powershell
deno run --no-lock --allow-env=POLAR_ACCESS_TOKEN --allow-read=C:/tmp/1620-production-map.json --allow-write=C:/tmp/1620-production-result.json --allow-net=api.polar.sh supabase/functions/scripts/polar-launch-catalog.ts --environment production --map C:/tmp/1620-production-map.json --output C:/tmp/1620-production-result.json --creator ISAAC --apply --confirm-production
```

Agregar `--confirm-annual-launch` solo si Isaac ha confirmado los anuales. Cada
repetición usa el resultado anterior como `--map` y una salida inexistente.
Los comandos se han preparado, **no ejecutado**. Los prefijos de creadores son
ejemplos operativos: usar el acordado con cada creador.

## Activación y comprobación manual (posterior, autorizada)

1. Revisar los IDs y productos draft creados; validar los precios IVA incluido,
   trials Pro conservados, descuentos acotados y sus importes con la tabla.
2. Antes de ofrecer Pro Plus anual, aplicar por el pipeline autorizado
   `20261014095626_billing_checkout_pro_plus_annual.sql` y desplegar el mapeo/runtime
   que reconoce esa clave. Extraer `map` del resultado para el secreto
   `POLAR_PRODUCT_MAP`; no cargar el objeto resultado entero. El snapshot del repo
   solo se actualizará con IDs observados tras ejecución real.
3. Habilitar productos draft después de verificar el backend. Los handlers de
   checkout actuales **no autoaplican estos descuentos**: en Polar configurar
   Checkout Links de campaña con el `discount_id` de `offers[plan:launch]`, o
   aplicar ese ID al crear la sesión mediante API. Con creador, sustituirlo por
   el ID/código compuesto, no sumar ambos. Esta entrega no cambia el paywall
   ni habilita la campaña en la app.
4. Probar cada plan sin descuento, con lanzamiento y con creador usando tarjetas
   sandbox; comprobar facturas de los meses 1, 2 y 3 (fin de creador), cancelación y refund,
   capabilities Pro/Plus y aislamiento de entornos. Probar que un código de Pro
   no sirve en Plus ni en Launch. Conservar evidencia sanitizada y actualizar
   Notion; esto no levanta por sí solo el no-go comercial de #1514/#1506.

## Vuelta atrás y fallos parciales

Retirar los Checkout Links/IDs de campaña o caducar sus descuentos para nuevas
altas. Archivar los productos nuevos si se abandona su venta; mantener IDs y
claves mientras haya suscripciones para reconciliar webhooks. No quitar un
mapa ni revertir la restricción SQL con filas `pro_plus_annual` existentes.
Restaurar el precio normal anterior desde el panel no migra suscripciones:
conservar también su price ID en el mapa.

Si hay timeout o respuesta fallida, puede haber escrituras parciales. Revisar
el catálogo y repetir con salida nueva: metadata permite recuperar productos y
descuentos ya creados. No asumir rollback remoto ni repetir POST a ciegas. Si
un recurso fue alterado fuera del script, resolver el drift manualmente; el
script no sustituye descuentos ya usados. No imprimir cuerpos HTTP de error.

## Evidencia y límites

RED inicial: test de catálogo ausente falla al importar el script. GREEN:
suite Deno vigente desde raíz con config de funciones, 544 PASS / 1 ignorado;
tabla, mapeo, idempotencia, precios históricos, duplicados en página posterior,
drift, colisiones y gates CLI cubiertos. Plan offline ejecutado sin permisos.
Formato/lint/check y diff revisados en la entrega. pgTAP ampliado a 20
aserciones; no ejecutado porque no hay Docker ni psql. Primeras ejecuciones de
suite fallaron por directorio/config de discovery; corregidas sin tocar tests
ajenos ni añadir Stripe retirado. Rust/UI omitidos: no se modifican.

`docs/roadmap/plan.md` fue retirado en nightly (#1601). No se recrea: no hay
cambio público de disponibilidad; la tarea queda en revisión, sin promoción,
deploy ni publicación del roadmap.
