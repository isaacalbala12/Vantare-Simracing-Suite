# Vantare · consola privada

Implementación de la primera consola personal de Isaac. Su interfaz se sirve como
assets de un Cloudflare Worker y **todas** las peticiones pasan antes por el
Worker. La API exige un JWT de Cloudflare Access verificado con la clave pública
del equipo, audiencia, emisor y correo del propietario. El Worker rechaza hosts
distintos de `DASHBOARD_HOSTNAME`, incluido `workers.dev`.

## Fuentes y límites

| Sección | Origen | Significado |
| --- | --- | --- |
| Producto | `intelligence_dashboard_snapshot()` en Supabase | Cuentas y dispositivos; un login no demuestra una sesión de simulación. |
| Negocio | `GET /v1/metrics/` de Polar, separado por producción/sandbox | MRR, suscripciones y cobros netos en céntimos. Nunca se extrapolan importes desde filas legacy. |
| Opiniones | `product_feedback` en Supabase | Solo texto voluntario sin caducar, con estado de revisión. Necesita la migración de opiniones de VAN-757. |
| Crecimiento | `intelligence_weekly_growth` en Supabase | Registro manual fechado de redes, visitas cualificadas y primeras sesiones confirmadas. |
| Retorno D7–13 | Cohortes introducidas manualmente en `intelligence_weekly_growth` | Cota mínima: retornos confirmados divididos entre pilotos maduros elegibles; los desconocidos se muestran aparte. Sin registros, «sin medir». |
| Mercado | Estudio fechado | Escenarios y objetivos, nunca presentados como ventas observadas. |

Una petición fallida aparece como «no disponible»; un cero de una respuesta
válida se conserva como cero. Las cifras manuales están identificadas como tales.
La moneda de presentación debe coincidir con la moneda de informes de la
organización Polar; este endpoint no devuelve el código de moneda.

## Preparación para activar la web

1. Revisar y aplicar mediante el procedimiento habitual la migración
   `supabase/migrations/20260923130000_intelligence_dashboard.sql`; revisar por
   separado la dependencia VAN-757 para leer opiniones. Ninguna de estas
   migraciones se aplica por construir o desplegar el Worker.
2. Crear una aplicación **Self-hosted** de Cloudflare Access para el subdominio
   exacto. Restringir su política al correo de Isaac. Obtener de ella el AUD y
   el dominio de equipo del emisor. Crear la ruta o dominio personalizado del
   Worker **solo cuando Access ya esté protegiendo ese host**.
3. Autenticar Wrangler en la cuenta Cloudflare correcta. Configurar los valores
   siguientes como secretos del Worker con `wrangler secret put NOMBRE`, sin
   guardarlos en Git ni en archivos `.env`:

   - `DASHBOARD_HOSTNAME`: nombre DNS exacto, sin esquema ni barra final.
   - `ACCESS_ISSUER`: `https://<equipo>.cloudflareaccess.com`.
   - `ACCESS_AUD`: audiencia de la aplicación Access.
   - `OWNER_EMAIL`: correo permitido por Access.
   - `SUPABASE_URL`: URL HTTPS del proyecto Supabase activo.
   - `SUPABASE_SERVICE_ROLE_KEY`: clave solo de servidor, nunca visible al navegador.
   - `POLAR_PRODUCTION_METRICS_TOKEN`: token Polar con alcance `metrics:read`.
   - `POLAR_SANDBOX_METRICS_TOKEN`: token separado del sandbox con el mismo alcance.
   - `POLAR_REPORTING_CURRENCY`: código ISO 4217 en mayúsculas verificado en Polar.

4. Ejecutar `npm ci`, `npm test` y `npx wrangler deploy --dry-run` desde este
   directorio. Tras la revisión y la autorización de promoción correspondientes,
   desplegar con `npx wrangler deploy`. El archivo `wrangler.jsonc` lleva
   `workers_dev: false` y no declara una ruta pública. Vincular el dominio
   protegido por Access y comprobar que todo acceso sin sesión, con otro correo
   o con JWT inválido se rechaza, incluso para `/styles.css`.
5. Comprobar la fuente Polar en ambos entornos y la moneda. Si no hay un token,
   la web deja la fuente «no disponible» en lugar de mostrar ingresos inventados.

El Worker conserva como máximo 25 opiniones recientes en cada respuesta; la
tabla limita la retención a 180 días. El registro semanal acepta una fila por
lunes y no contiene identificadores de clientes. La API no ofrece listas de
identidades, pagos ni eventos de carrera.

La cohorte manual de cada lunes admite tres recuentos juntos: pilotos ya maduros,
retornos confirmados entre D7 y D13 y casos sin resultado. Exige una nota de
procedencia, al menos 13 días desde el inicio de la semana y no permite que
retornos más desconocidos superen los elegibles.
La cifra principal es una **cota mínima**; el porcentaje entre casos conocidos
se muestra aparte. La captura automática consentida pertenece a otra entrega.

## Desarrollo local

`npm test` prueba la verificación de Access, separación de entornos, estado de
fuentes, escritura manual y revisión de opiniones. `npx wrangler deploy
--dry-run` comprueba el empaquetado. Se puede abrir `public/index.html` en un
servidor local para revisar el diseño; no simula Access ni datos reales y por
eso muestra las fuentes como no disponibles.

Referencias: [Cloudflare Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/),
[Polar Metrics API](https://polar.sh/docs/api-reference/metrics/get).
