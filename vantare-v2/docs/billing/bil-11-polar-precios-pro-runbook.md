# BIL-11 — runbook de precios Pro (5,99 €/mes y 59,90 €/año)

Issue: [ISA-1499](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1499).
Este texto no verifica ningún despliegue ni ninguna ejecución en Polar: la
evidencia de cada paso se guarda en la issue (IDs y SHA, nunca tokens).

## Qué cambia

| Clave de checkout | Producto Polar | Precio | Capabilities |
|---|---|---|---|
| `pro_monthly` | el mismo producto mensual actual | 5,99 EUR/mes, IVA incluido | `vantare.plan.pro` |
| `pro_annual` (nueva) | producto **nuevo**, recurrente anual | 59,90 EUR/año, IVA incluido | `vantare.plan.pro` |
| `launch_lifetime` | sin cambios | 30 EUR una vez | sin cambios |

- En Polar cada producto tiene un único ciclo y no se puede cambiar; por eso el
  anual es otro producto y otra clave de checkout.
- El mensual conserva su `product_id`: el webhook resuelve por producto, así que
  altas, renovaciones y cancelaciones siguen igual. Polar archiva el precio
  4,99 al quitarlo del producto y **mantiene a los suscriptores actuales en
  4,99** (grandfathering). Mover a alguien al precio nuevo es una acción
  manual aparte, fuera de este runbook.
- `tax_behavior: "inclusive"` en cada precio: el importe ya incluye IVA.
- El anual concede exactamente las mismas capabilities que el mensual; lo fija
  `EXPECTED_KEY_META` en `supabase/functions/_shared/mapping.ts` y lo prueban
  `mapping.test.ts` y `billing-webhook/process.test.ts`.

## Piezas

- Script idempotente: `supabase/functions/scripts/polar-pro-prices.ts`
  (Deno, sin dependencias). `--dry-run` imprime las llamadas sin red.
- Migración `20261008000000_billing_checkout_pro_annual.sql`: admite
  `pro_annual` en `billing_checkout_attempts`.
- Secreto `POLAR_PRODUCT_MAP` (no versionado). Plantilla con IDs ficticios:
  `vantare-v2/configs/polar-product-mapping.example.json`.

Variables (solo nombres): `POLAR_ENVIRONMENT` (`sandbox` | `production`),
`POLAR_ACCESS_TOKEN` (token de organización con `products:read` y
`products:write`), `POLAR_PRODUCT_MAP`. Nunca imprimirlas ni pegarlas en issues.

## 1. Sandbox

Desde `supabase/functions`, con `POLAR_ENVIRONMENT=sandbox` y el token sandbox
cargado en la sesión:

```bash
# Plan sin red (no necesita token)
deno run --allow-env=POLAR_ACCESS_TOKEN,POLAR_ENVIRONMENT scripts/polar-pro-prices.ts \
  --organization-id <ORG_SANDBOX> --pro-monthly-product-id <PRO_MENSUAL_SANDBOX> --dry-run

# Ejecución real en sandbox
deno run --allow-env=POLAR_ACCESS_TOKEN,POLAR_ENVIRONMENT --allow-net=sandbox-api.polar.sh \
  scripts/polar-pro-prices.ts --organization-id <ORG_SANDBOX> --pro-monthly-product-id <PRO_MENSUAL_SANDBOX>

# Segunda ejecución: debe imprimir "writes": 0 y los mismos IDs
```

El JSON final trae `pro_monthly.{product_id,price_id}` y
`pro_annual.{product_id,price_id}`. Con ellos:

1. Editar el `POLAR_PRODUCT_MAP` de sandbox: añadir el nuevo precio mensual a
   `checkout_keys.pro_monthly.polar_price_ids` (mantener el antiguo) y a
   `price_id_to_checkout_key`; añadir `checkout_keys.pro_annual` y sus dos
   entradas inversas como en la plantilla; subir `catalog_version`.
2. Validar el mapa localmente antes de cargarlo (no imprime el contenido):

   ```bash
   deno eval 'import {loadPolarProductMap} from "./_shared/mapping.ts"; const r = loadPolarProductMap(Deno.env.get("POLAR_PRODUCT_MAP"), {environment: Deno.env.get("POLAR_ENVIRONMENT")}); console.log(r.ok ? Object.keys(r.map.checkout_keys) : r.code)'
   ```

3. Aplicar la migración y cargar el secreto en el proyecto sandbox por el
   pipeline autorizado (`supabase db push`, `supabase secrets set
   POLAR_PRODUCT_MAP=... --project-ref <SANDBOX_REF>`), y redesplegar
   `billing-checkout` y `billing-webhook` con `deploy-approved-functions.ps1`.
4. Verificar en sandbox con tarjeta de pruebas:
   - checkout `pro_monthly` cobra 5,99 y concede `vantare.plan.pro`;
   - checkout `pro_annual` cobra 59,90/año y concede `vantare.plan.pro`;
   - cancelar el anual mantiene acceso hasta fin de periodo; revocar lo quita;
   - una suscripción mensual previa a 4,99 sigue activa a 4,99.
5. Anotar en ISA-1499 los IDs sandbox creados y el resultado.

## 2. Producción (solo con autorización de Isaac en el momento)

Mismos pasos con `POLAR_ENVIRONMENT=production`, token de producción y
`--allow-net=api.polar.sh`. El script exige además `--confirm-production`:

```bash
deno run --allow-env=POLAR_ACCESS_TOKEN,POLAR_ENVIRONMENT scripts/polar-pro-prices.ts \
  --organization-id <ORG_PROD> --pro-monthly-product-id <PRO_MENSUAL_PROD> --dry-run
deno run --allow-env=POLAR_ACCESS_TOKEN,POLAR_ENVIRONMENT --allow-net=api.polar.sh \
  scripts/polar-pro-prices.ts --organization-id <ORG_PROD> --pro-monthly-product-id <PRO_MENSUAL_PROD> --confirm-production
```

Orden: migración → `POLAR_PRODUCT_MAP` nuevo → redeploy de funciones → script.
Así ningún checkout ni webhook del anual llega antes de que el backend lo
reconozca. Verificación: en el panel de Polar el mensual muestra un único
precio activo de 5,99 EUR y el anual 59,90 EUR, ambos IVA incluido; segunda
ejecución con `"writes": 0`.

## Vuelta atrás

- **Precio mensual:** `PATCH /v1/products/<PRO_MENSUAL>` con
  `{"prices":[{"amount_type":"fixed","price_amount":499,"price_currency":"eur","tax_behavior":"inclusive"}]}`
  (o desde el panel). Los suscriptores que pagaron 5,99 conservan ese precio.
  Mantener ambos price IDs en `POLAR_PRODUCT_MAP`.
- **Anual:** archivar el producto (`PATCH` con `{"is_archived": true}`). Deja de
  venderse; las suscripciones existentes siguen y renuevan con normalidad, por
  eso `pro_annual` **no** se borra de `POLAR_PRODUCT_MAP` mientras quede alguna:
  se puede poner `"active": false` solo si no queda ninguna suscripción anual,
  porque una clave inactiva hace que el webhook ignore sus eventos.
- **Código/migración:** la migración solo amplía un `check`; no hace falta
  revertirla. Revertir el commit sin retirar antes el anual de Polar dejaría
  sus webhooks en cuarentena (`unknown_product_id`).
