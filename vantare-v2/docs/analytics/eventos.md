# Analítica de uso · #1609 / VANTA-22

Estado: contrato de esta rama; no activa producción. PostHog UE. Solo una
decisión explícita de **uso**, distinta de informes de fallos, permite recoger
y enviar. Ambas opciones empiezan apagadas. Revocar en Ajustes elimina pendientes.
Un archivo antiguo con `usage: true` sin `usage_decided: true` no constituye aceptación.
No se recupera actividad anterior al consentimiento.

## Inventario comprobado

- `native/ipc/src/product.rs`: versión/canal públicos fijados al compilar.
- `native/packaging/build-config.ps1`: inyección de `VANTARE_POSTHOG_KEY` de captura
  durante el build. No es la clave personal de administración. Sin ella no hay envío.
- `native/services/src/diagnostics.rs`: `privacy.json`, UUID v4 aleatorio de
  instalación, cola atómica acotada a 32 slots, productores sin red.
- `native/services/src/diagnostics/sender.rs`: único emisor (proceso services),
  endpoint `https://eu.i.posthog.com/i/v0/e/`, revalidación del permiso y catálogo,
  ACK `1`/`Ok`, reintento cada minuto, cierre con cancelación/join.
- Ya existían `app_started`, `live_session_started`, `layout_widgets`.
  No existe SDK/autocapture/replay en la app nativa.
- Consentimiento de diagnóstico y guardado con conflictos:
  `native/hub/src/settings/privacy.rs`. Se reutilizan componentes Orbit.

## Catálogo cerrado

Solo estas propiedades de negocio; JSON con campos extra, valores libres o
eventos desconocidos se rechaza antes de persistir y otra vez antes de enviar.

| Evento | Propiedades | Cuándo / interpretación |
| --- | --- | --- |
| `app_started` | `version`, `channel` | Arranque del supervisor con permiso previo. |
| `live_session_started` | `simulator`: `lmu`/`acc` | Transición live existente; nunca circuito/piloto. |
| `layout_widgets` | `widget_types`: catálogo, máximo 32 | Cambio de selección visible del layout; configuración, no tiempo efectivo. |
| `page_viewed` | `page` | Entrada a una página real del Hub tras consentimiento. |
| `page_usage` | `page`, `duration_seconds`: entero 1..60 | Tiempo observado con ventana activa, por intervalos y al cambiar/salir. |
| `widget_usage` | `widget_type`, `duration_seconds`: entero 1..60 | Tipo efectivamente visible en overlays; una vez por tipo aunque haya duplicados. |
| `feature_used` | `feature` | Acción explícita completada; no contenido de la acción. |
| `installation_observed` | ninguna | Primera observación consentida de esta instalación; no acredita que Setup acabara. |
| `account_signed_in` | ninguna | Sesión confirmada por services; **no demuestra creación de cuenta**. |
| `commercial_license_observed` | ninguna | Credencial verificada con derecho comercial vigente; **no es recibo de una compra nueva**, puede proceder de una concesión. |

Páginas: `home`, `workshop`, `studio`, `launcher`, `calendar`, `strategy`,
`engineer`, `analysis`, `testing`, `roadmap`, `account`, `licenses`,
`notifications`, `settings`. Funciones: `widget_added`, `launch_profile`,
`strategy_recalculated`, `report_sent`, `checkout_opened`.
Widgets: los 18 nombres de `WIDGET_TYPES` en `diagnostics.rs`; mismo catálogo
validado del emisor existente. No se mandan IDs ni nombres de instancias.

El catálogo web separado admite exclusivamente `download_requested` con
`platform` en `windows`/`linux`/`macos` (snippet de Marketing). No es un evento
admitido por la cola nativa. Cuenta creada/compra completada siguen sin productor
aprobado; no se aceptan esos nombres como sustitutos de las observaciones.

Propiedades técnicas fijas añadidas por el emisor:
`$process_person_profile=false`, `$ip=null`, `$geoip_disable=true`.
`distinct_id` es un UUID v4 aleatorio local, nunca huella de dispositivo/licencia,
OAuth subject, email, nombre ni UUID de backend. No se vinculan perfiles personales
ni cuentas entre equipos. Identificador de cuenta **omitido**: no es necesario
para estas métricas. La IP es visible al servidor de transporte; no se incorpora
a propiedades ni se usa para geolocalización. Esto no convierte los datos en anónimos.

### Contrato de ID para #1610

`vantare_services::diagnostics::consented_usage_id(&diagnostics::data_root()?)`
devuelve `Result<Option<String>>`: `None` sin `usage && usage_decided`, también
tras revocar; configuración inválida devuelve error y se omite el vínculo.
No crea ni lee `anonymous-id` mientras el permiso está apagado. Con permiso,
devuelve el mismo UUID v4 local (36 caracteres minúsculos) usado como
`distinct_id` por el emisor. Se conserva entre arranques y revocaciones; no
identifica cuentas ni equipos entre sí. No copiarlo al namespace Testing.
#1610 debe revalidarlo en el momento de enviar cada informe; aceptar el informe
voluntario o sus capturas no concede permiso de uso. Ausencia/error: omitir
el campo opcional. Nunca sustituirlo por cuenta, licencia, huella ni UUID web.

No texto, rutas, URL, contenido, telemetría, nombres de pilotos, credenciales,
capturas, importe, pedido o ID de producto libre. Duraciones usan reloj monotónico:
no se cuentan gaps >2 s ni el tiempo previo a aceptar. La cola puede llenarse y
descartar observaciones: los resultados son uso observado de quienes consienten,
no un censo ni un contador de facturación. No hay backfill ni envíos sintéticos.

## Elección del instalador · pendiente #1591 / PR #1600

No se toca esa PR. Contrato preparado para su integración posterior:
Setup escribirá, solo al confirmar una casilla apagada por defecto, el objeto
`{"version":1,"usage":true,"explicit":true}` en
`<raíz de diagnóstico>/installer-analytics-consent.json`, con guardado atómico.
Rechazar puede escribir `usage:false`; ausencia no implica sí. La app valida el
objeto cerrado y versión y lo consume únicamente si no hay decisión de uso
guardada. Una reinstalación nunca sobrescribe una revocación en Ajustes.
La elección no afecta `crashes`. Un documento inválido mantiene todo apagado y
la pregunta de primer arranque. El mismo UUID de instalación se crea tras aceptar.
No pasar tokens, IDs web ni consentimiento por query/argumentos del ejecutable.

## Embudo y límites que requieren coordinación

El embudo exacto solicitado es descarga → instalación → cuenta creada → compra.
Las señales disponibles hoy son observaciones; no se renombran para aparentar
resultados exactos. La identidad web y la de instalación son distintas: no puede
calcularse conversión individual descarga→instalación sin un puente consentido
que se acuerde con Marketing/instalador. Se preparan conteos separados y embudo
nativo observado. Registro/pago exactos necesitan metadata y consentimiento
durable en backend; no se cambia el esquema ni producción en esta entrega.
Polar sigue siendo autoridad monetaria. Pendientes y fuentes en `informe-1609.md`.

## Verificación

Tests de services con HTTP loopback: sin permiso explícito ningún request;
revocación descarta cola; payload exacto permitido; campos/valores intrusivos
rechazados; ningún endpoint real. Tests de migración/persistencia del Hub y reloj
inyectado, más fmt/check/Clippy/Nextest/lifecycle/telemetría nativos.
