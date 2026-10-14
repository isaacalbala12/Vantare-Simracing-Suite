# Panel PostHog UE · #1609

Preparado, **no creado en el PostHog real**. `tools/analytics/posthog_paneles.py`
genera las ocho definiciones sin red ni lectura de claves. Consultar el catálogo
en [eventos.md](eventos.md). El panel explica su población consentida y sus límites.

| Insight | Medida | Ventana |
| --- | --- | --- |
| Instalaciones activas | UUID distintos de `page_viewed` por día | 30 días |
| Páginas visitadas | Entradas, desglose `page` | 30 días |
| Tiempo por página | Suma `duration_seconds` de `page_usage`, por `page` | 30 días |
| Funciones usadas | `feature_used` por `feature` | 30 días |
| Uso de widgets | Suma segundos de `widget_usage` por `widget_type` | 30 días |
| Retención | Primera visita y vuelta a `page_viewed`, intervalos diarios | 14 días |
| Embudo nativo observado | `installation_observed` → `account_signed_in` → `commercial_license_observed` | Ordenado, conversión hasta 30 días |
| Descargas web | UUID distintos de `download_requested`, por `platform` | 30 días; separado |

No hay cohortes con email, revenue inventado ni conversiones web→app sin puente.
Sin datos se muestra ausencia. «Activo» significa ventana observada, no interacción
continua; los widgets son visibles, no atención visual. La cola es acotada y puede
perder observaciones. Retención corresponde a instalaciones, no cuentas/personas.
Las series de sumas están en segundos; Isaac puede leer minutos dividiendo por 60.

El embudo exacto de venta queda definido para una fase coordinada:
`download_requested` → `installation_completed` → `account_created` →
`purchase_completed`, ordenado a 30 días, deduplicación por transición backend y
atribución consentida web→instalación→cuenta. **No se crea ese insight como si las
señales actuales lo probasen.** Requiere integración Marketing, #1591, consentimiento
durable de backend y señal Polar paid, sin considerar trial, login o permisos Owner
como compra. Las señales actuales siguen visibles con nombres honestos.

## Ejecución posterior por el orquestador

1. DUDA para Isaac en ventana privada: facilitar clave personal de API UE con
   scopes `dashboard:read`, `dashboard:write`, `insight:read`, `insight:write`.
   No pedirla por chat, buscarla ni ponerla en .env/repositorio/logs.
2. Guardarla fuera del repo en `~/.vantare/posthog-personal-key`; permisos privados
   del usuario. Identificar el project ID público y confirmar autorización de escritura.
3. Revisar localmente: `python tools/analytics/posthog_paneles.py`.
4. Solo con esa autorización posterior:
   `python tools/analytics/posthog_paneles.py --apply --project-id ID`.
5. Abrir el enlace impreso y verificar los ocho insights y descripciones, intervalos
   y ausencia de datos antes de envío autorizado. No publicar ni compartir el panel.

El script admite exclusivamente `https://eu.posthog.com`, rechaza redirects y
paginación a otro origen/proyecto, lee listados completos y no toca paneles ajenos.
Reejecutar recupera una creación parcial por nombre y etiqueta. No borra ni
sobrescribe insights; una asociación ajena/duplicada requiere revisión. API real
pendiente: las pruebas locales validan definición/operación con un servidor simulado.
Nunca usar este script para capturar eventos de prueba en PostHog real.

Referencias oficiales consultadas el 14/10/2026:
[Insights API](https://posthog.com/docs/api/insights),
[Dashboards API](https://posthog.com/docs/api/dashboards),
[API y región UE](https://posthog.com/docs/api).
