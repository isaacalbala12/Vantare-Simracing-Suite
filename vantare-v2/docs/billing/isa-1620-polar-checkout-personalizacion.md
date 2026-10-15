# Polar: personalización del checkout de Vantare

Investigación pública realizada el 14/10/2026 para #1620. Consultadas las guías
oficiales y API `2026-10`, contrastadas con esquemas y UI públicos de
`polarsource/polar` (SHA observado `b154994917d5ae965b4986a04ac84358ea4e0677`).
No se abrió un checkout real, Dashboard autenticado ni API comercial; no se
usaron secretos. Los pasos de Dashboard se contrastan con código público,
no con la organización de Isaac. Lo no documentado se señala como límite,
sin convertir una ausencia en garantía contractual de Polar.

| Qué se puede | Cómo (API o Dashboard) | Scope o paso manual |
|---|---|---|
| **Nombre y logo/avatar de la organización: sí.** Aparecen en checkout, portal y correos. | Settings → Preferences → Profile; API `PATCH /v1/organizations/{id}` con `name` y `avatar_url`. [API Organization](https://polar.sh/docs/api-reference/2026-10/organizations/update-organization), [UI Profile](https://github.com/polarsource/polar/blob/b154994917d5ae965b4986a04ac84358ea4e0677/clients/apps/web/src/components/Settings/OrganizationProfileSettings.tsx). | `organizations:write`; si se sube por API, además `files:write`, archivo `organization_avatar`. El script no cambia la organización. Seleccionar el logo oficial y comprobar legibilidad en claro/oscuro. |
| **Imágenes del producto: sí**, reordenables, hasta 10 MB por imagen. | Editor de producto → Product media. API `medias: [file_id, ...]` en creación/PATCH de producto; los archivos deben ser `product_media`, subidos y de la misma organización. [Products](https://polar.sh/docs/features/products), [Product Update](https://polar.sh/docs/api-reference/2026-10/products/update-product). | `products:write` y `files:write`: crear archivo, subir a la URL de carga devuelta y completar la carga; luego asociar IDs. [Files Create](https://polar.sh/docs/api-reference/2026-10/files/create-file), [Complete Upload](https://polar.sh/docs/api-reference/2026-10/files/complete-file-upload). No se añaden imágenes automáticamente en esta entrega. |
| **Tema claro/oscuro del checkout alojado: sí.** Por defecto sigue al sistema. | Añadir `theme=dark` o `theme=light` a la URL persistente del Checkout Link. [Checkout Links](https://polar.sh/docs/features/checkout/links). | Sin scope para decorar una URL. Crear el enlace requiere `checkout_links:write`; reutilizarlo no requiere PATCH. Implementado: el script exporta `creator_link.url` con `theme=dark`, preservando query y fragmento. Distribuir esa URL, no una sesión temporal. |
| **Tema persistido por organización o por JSON del Checkout Link: no documentado.** | Los esquemas de organización y de [CheckoutLinkCreate](https://polar.sh/docs/api-reference/2026-10/checkout-links/create-checkout-link) no ofrecen `theme`/tema global. El parámetro vive en la URL. | No enviar `theme` en POST/PATCH ni inventar un ajuste global. Los enlaces antiguos distribuidos sin ese parámetro seguirán usando su preferencia. |
| **Tema oscuro en embed: sí.** | `data-polar-checkout-theme="dark"` o `PolarEmbedCheckout.create(url, { theme: "dark" })`. [Embedded Checkout](https://polar.sh/docs/features/checkout/embed). | Cambio en la web, fuera de este script. Autorizar su host en Settings → Preferences → Embedding o `embed_hosts` (`organizations:write`). No se instaló biblioteca ni se modificó la web. |
| **Color carmín de botones, acento, fuentes, bordes o CSS interno: no hay control oficial documentado.** | Las APIs de organización, producto y checkout no exponen colores/brand/CSS. El embed permite estilizar el botón que lo abre, no documenta un tema CSS para el formulario interno. [Embed](https://polar.sh/docs/features/checkout/embed), [Organization schema](https://github.com/polarsource/polar/blob/b154994917d5ae965b4986a04ac84358ea4e0677/server/polar/organization/schemas.py). | Usar carmín en logo, medias y página/botón Vantare. Mantener el formulario Polar oscuro. Confirmar con soporte si se necesita una personalización alojada que no está documentada; no prometerla. |
| **Nombre y descripción del producto: sí**, descripción Markdown. | Editor de producto o POST/PATCH `name`/`description`. [Products](https://polar.sh/docs/features/products). Intervalo procede del producto/precio. | `products:write`. Implementados ES: Pro, Pro Plus, sufijo « · Lanzamiento» y Launch Edition; PATCH cosmético solo esos dos campos. La creación de Launch Edition queda fuera del catálogo; se corrige la ya configurada. |
| **Textos ES/EN propios por idioma del producto: no hay i18n de producto documentado.** | La API admite `name: string` y `description: string`, no diccionarios por locale. [Product schema](https://github.com/polarsource/polar/blob/b154994917d5ae965b4986a04ac84358ea4e0677/server/polar/product/schemas.py). | Se mantiene texto ES, sin duplicar productos ni cambiar identidad monetaria. El idioma del formulario no traduce automáticamente los textos comerciales. |
| **Textos de campos propios: sí; reescribir etiquetas o CTA estándar: no documentado.** | Custom Fields con su etiqueta y opciones; no existe control de copy arbitrario de botones estándar en Checkout API. [Custom Fields](https://polar.sh/docs/features/custom-fields), [Checkout API](https://polar.sh/docs/api-reference/2026-10/checkouts/create-checkout-session). | `custom_fields:write` y `products:write` al adjuntarlos. No añadir campos ni cambiar copy de formulario en esta entrega. |
| **Campos adicionales: sí**, texto/textarea, número, fecha, checkbox y selección. Obligatorios u opcionales. | Settings → Custom Fields; adjuntar al producto con `attached_custom_fields: [{custom_field_id, required}]`. Datos/prefill por `custom_field_data` en sesión o `custom_field_data.{slug}` en URL. [Custom Fields](https://polar.sh/docs/features/custom-fields), [Create Custom Field](https://polar.sh/docs/api-reference/2026-10/custom-fields/create-custom-field). | `custom_fields:write`, `products:write`; para crear sesión propia, `checkouts:write`. El tipo de campo no se cambia después de crear. Evitar preguntas comerciales innecesarias. |
| **Campos estándar y dirección: personalización parcial.** | Prellenar email/nombre desde URL; sesiones admiten nombre/email/dirección fiscal/Tax ID. `require_billing_address` controla dirección completa; EEUU siempre requiere la completa. `allow_discount_codes` controla el campo de códigos. [Checkout API](https://polar.sh/docs/api-reference/2026-10/checkouts/create-checkout-session), [Link Create](https://polar.sh/docs/api-reference/2026-10/checkout-links/create-checkout-link). | `checkouts:write` o `checkout_links:write`. No se documenta reordenar/ocultar libremente campos fiscales obligatorios. Enlace ISAAC conserva descuento fijo y entrada de códigos deshabilitada. |
| **Idioma del checkout: sí, en beta, ES y EN incluidos.** | Activar feature de localización en organización; detección del navegador o `?locale=es`/`?locale=en`; sesión API `locale`. [Localization](https://polar.sh/docs/features/checkout/localization). API de organización: `feature_settings.checkout_localization_enabled`. | Dashboard Preferences → Features, o `organizations:write`; sesión propia `checkouts:write`. Pendiente comprobar/activar por el operador. Sin selector; errores y correos permanecen EN durante beta. El script conserva cualquier locale existente y no lo fuerza. |
| **Dominio propio para alojar el formulario Polar: no se encontró soporte documentado.** | Ninguna configuración de custom domain/DNS en índice oficial ni Organization Update. Alternativa: página del dominio Vantare que abre/incrusta Polar. [Índice](https://polar.sh/docs/llms.txt), [Embed](https://polar.sh/docs/features/checkout/embed). | `embed_hosts` autoriza el host, no crea dominio de checkout. URLs de retorno/éxito tampoco lo crean. Mantener enlace Polar o aprobar integración web separada; pedir confirmación a Polar si un dominio alojado propio es requisito. |
| **Navegación y elección de producto: sí.** | `return_url` habilita volver; `success_url` redirige tras pagar; lista `products` y su orden controlan el selector; `product_id` en URL preselecciona. Un producto por compra. [Checkout Links](https://polar.sh/docs/features/checkout/links). | `checkout_links:write` o `checkouts:write` para presets. No altera el alcance ni descuentos de esta tarea. El enlace compartido conserva cuatro productos de lanzamiento sin prueba gratis, tampoco con código de creador. |

## Propuesta concreta para Vantare

1. **Ahora, en sandbox por la vía del operador:** ejecutar el script revisado y
   sustituir la URL de creador distribuida por la salida con `theme=dark`.
   Tema del sistema claro debe seguir mostrando checkout oscuro. Las claves
   técnicas quedan fuera de nombre/Markdown. Mensual/anual se distingue en el
   precio, con nombres iguales por plan.
2. **Logo oficial existente:** avatar reconocible, con margen y buena lectura
   en un círculo pequeño sobre oscuro y claro. No inventar un logo nuevo.
   Cargarlo en Profile; el script no toca `avatar_url` ni solicita más scopes.
3. **Medias:** una composición sobria por plan, fondo grafito y logo, con
   carmín del sistema Orbit (`#d52f49`, `docs/design/orbit-v03/tokens.json`).
   Añadir solo capturas reales y textos que cumpla product-contract.md. No
   incluir precios en la imagen: los controla Polar. Reutilizar imagen del
   plan en normal/lanzamiento; el sufijo comercial distingue la oferta.
   Esto es una propuesta para revisión del orquestador, no un diseño publicado.
4. **Español de formulario:** activar la beta de localización y probar `locale=es`.
   Si se distribuyen enlaces por idioma, ES/EN puede fijarse en URL; el texto
   comercial seguirá ES por el límite de producto. No usar «todo de por vida»
   para Launch Edition: incluye Strategy Planner, Análisis de telemetría e
   Ingeniero local sin límite cuando se lancen, sin fechas; ninguna otra
   función nueva, conforme a los textos v3 aprobados.
5. **Carmín y dominio:** conservar checkout Polar oscuro y usar el acento en
   logo/medias. Si se necesita continuidad visual en la web, preparar por
   separado embed sobre página Vantare con botón carmín y host exacto
   autorizado. No prometer color carmín de «Pagar», fuentes propias ni dominio
   propio del formulario. No se implementa ni se despliega esa página aquí.

## Verificación pendiente del operador

Revisar en escritorio y móvil: nueve nombres, Markdown y recorte móvil;
mensual/anual junto al precio; oscuro con sistema claro; logo y medias; ES
tras habilitar beta y EN explícito. Confirmar que los IDs, precios, trial,
metadata y derechos no cambiaron por el PATCH cosmético y que repetir sin
cambios escribe cero. No quitar los bloqueos de cambio de plan ni alterar
retención histórica para mejorar el aspecto. Estos tests locales no son
prueba de Dashboard, render ni activación real.

Evidencia local: `~/evidence/1620/checkout-names/`; capturas de documentación
fuente en ficheros públicos y tests RED→GREEN, sin datos comerciales reales.
