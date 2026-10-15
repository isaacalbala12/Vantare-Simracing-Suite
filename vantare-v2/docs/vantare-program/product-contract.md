# Contrato de producto Vantare

Estado: contrato de producto; lanzamiento reconciliado el 2026-09-14 con la decisión del 2026-09-11. Los requisitos y precios decididos no certifican disponibilidad comercial.

## Definición y principios

Vantare es una suite integrada de aplicaciones de simracing.

Sus tres pilares son:

1. rendimiento claramente superior a alternativas pesadas;
2. claridad y facilidad de uso, incluso en funciones avanzadas;
3. una calidad visual excepcional y coherente.

Es una aplicación de escritorio local-first para Windows 10 y 11. Los módulos
comparten shell, cuenta, configuración y Telemetry Core, pero conservan
contratos y almacenamiento propios. No se convierten en microservicios ni en
aplicaciones independientes.

## Usuarios y lanzamiento

El producto sirve a pilotos casuales, competitivos y de resistencia. La decisión del 2026-09-11 prevé una beta pública reiniciada, versiones
iterativas y después lanzamiento estable. Sustituye la decisión anterior de
lanzamiento directo sin beta abierta. Consultar [etapas y decisiones aún pendientes](../plan-beta-publica-y-lanzamiento.md) y el [roadmap](../roadmap-maintenance.md);
este contrato no anuncia apertura ni fija una fecha nueva.

La beta pública debe incluir Hub, Launcher, Overlay Studio, los widgets
principales, Telemetry Core, Telemetry Analysis, Engineer/Spotter Beta, Strategy
Planner, calendario, cuenta, Billing, ajustes, instalador y actualizador.

Engineer/Spotter puede seguir ampliándose tras el lanzamiento, pero su beta
debe ser segura, observable y honesta.

## Simuladores

Orden de drivers:

1. Le Mans Ultimate;
2. iRacing;
3. Assetto Corsa 2014;
4. Assetto Corsa EVO;
5. Assetto Corsa Competizione;
6. Automobilista 2.

Los drivers implementan el mismo contrato canónico siempre que la fuente
permita la semántica. Una capability no disponible se declara como tal.

## Idiomas, privacidad y funcionamiento local

Español, inglés, italiano y portugués son obligatorios. Portugués brasileño es
la primera variante de Engineer. El tono es profesional y cercano.

- Cero telemetría de producto por defecto.
- Diagnósticos anónimos solo con consentimiento revocable.
- El usuario ve el paquete exacto antes de exportarlo.
- No se envían archivos de telemetría, voz, estrategias, perfiles, nombres ni
  rutas sin acción explícita **o** sin un consentimiento permanente opt-in,
  versionado y registrado (ADR 0009). Bajo ese consentimiento, cada envío
  automático es inspeccionable antes del despacho en una cola visible con
  historial; pausar detiene la cola y cancela reintentos y todo envío aún no
  aceptado por el servidor (lo ya aceptado cuenta como enviado y puede
  eliminarse mediante el borrado remoto); la revocación y el borrado remoto
  son acciones separadas y siempre disponibles. Los paquetes
  automáticos son derivados seudonimizados con allowlist cerrada de campos:
  nunca telemetría cruda, voz, nombres ni rutas.
- Cuenta, compras y entitlement son remotos; los datos de producto son locales.
- No hay sincronización entre equipos en el alcance actual.
- Recording está desactivado por defecto y puede deshabilitarse por completo.

## Licencias

### Gratuito

- Hub y Launcher completos.
- Calendario básico, cuenta local y ajustes.
- Standings, Relative, Delta y Pedals.
- Vantare Original.
- Vantare Crystal con marca Vantare integrada y no eliminable.
- Overlay Studio limitado a los widgets gratuitos.

### Vantare Pro — 5,99 EUR/mes o 59,99 EUR/año

- Precios normales con IVA incluido; catálogo preparado en ISA-1499/1620,
  sin certificar venta ni ejecución Polar.
  Mensual y anual conceden exactamente las mismas capabilities.
- Toda la aplicación publicada en Stable.
- Soporte en Discord.

### Vantare Pro Plus — 9,99 EUR/mes o 99,90 EUR/año

- Todo Pro.
- Acceso a Nightly/Beta privada, tests, encuestas y previews activas.

Durante el mes de apertura de la **beta pública** (desde el 26-oct-2026
19:00 Europe/Madrid), el primer periodo Pro cuesta **3,99 EUR mensual o
39,90 EUR anual**. Después renueva a **5,99 EUR/mes o 59,99 EUR/año**.
La ventaja del primer periodo no fija el precio de las renovaciones.
Pro Plus es el extra para Nightly/Beta privada, tests, encuestas y previews;
no se confunde con Founders ni con un rol operativo.
El código de creador **no se combina con el precio del primer periodo**.
Los informes se habilitan **desde el segundo mes**. No se prometen informes
el primer día por adquirir un plan.

Los borradores técnicos anteriores de #1620 describían productos recurrentes
con precio de lanzamiento permanente y acumulación de creador. Ese modelo
queda sustituido por esta decisión de Isaac; no se debe publicar ese catálogo
heredado sin reconciliar su cobro del primer periodo y las renovaciones.
La compra web se coordina en VANTA-42; este contrato no acredita activación
ni cobros reales. La contabilidad de creadores sigue sin pagos automáticos.

Inventario real comunicado por Isaac el 15-oct-2026: Pro mensual 4,99 EUR,
Launch Edition 30 EUR (retirada de oferta) y Founders 50 EUR. Aún no existen
Pro anual, precios 5,99/59,99 ni Pro Plus en producción. Los precios anteriores
son decisiones de producto pendientes de configurar; no acreditan disponibilidad.
El ID de Founders se documenta en el [contrato técnico](../billing/founders-1661.md).

### Founders — precio de fundador: 50 EUR una vez

- Plan propio: todos los módulos y widgets presentes y futuros, para siempre.
- Disponible desde la beta pública: **26-oct-2026 a las 19:00 Europe/Madrid**,
  **sin fecha de fin**. Una configuración del servidor permite cerrar la venta.
- Pago único, sin caducidad ni renovación. El precio subirá más adelante,
  sin fecha prevista. No es el precio fijo de lanzamiento de una suscripción.
- Quien tiene Pro o Pro Plus puede comprarlo. Se activa al instante y su
  suscripción deja de renovar al final del periodo ya pagado, sin reembolso.
  Owner ve la cancelación pendiente o confirmada y puede revisar incidencias.
- No añade roles Owner/tester ni canales privados por sí solo.
- Implementación preparada en VANTA-83/#1661; no certifica apertura comercial.
  [Contrato, configuración e integración web](../billing/founders-1661.md).

### Launch Edition retirada de la oferta

No se ofrece ni se vende. Se conserva exclusivamente la lectura de posibles
compras históricas, sus derechos originales, reembolsos y reconciliación:
módulos existentes al comprar y sus mejoras, incluido Engineer inicial;
Testers sin Nightly. Esos derechos no se convierten ni se borran al retirar
la opción de compra. Las migraciones y pruebas históricas se mantienen.

Crystal pierde la marca con cualquier licencia de pago. Los widgets fuera del
catálogo gratuito requieren licencia.

## Billing

- Polar es la autoridad comercial.
- Supabase permanece como backend de cuenta/licencia endurecido.
- Stripe se retira cuando Polar esté operativo y reconciliado.
- Trial de siete días con método de pago y recordatorio solo para Pro a precio
  normal (mensual/anual); sin trial en lanzamiento, creador ni Pro Plus.
- Tras un fallo existe recuperación técnica máxima de tres días; después se
  baja al modo gratuito.
- Cancelar conserva acceso hasta la fecha pagada.
- Un dispositivo activo, reemplazable tras login.
- El entitlement offline firmado funciona hasta su expiración real.
- Ninguna venta pública hasta cerrar la matriz monetaria y reconciliación.

## Calidad

- Implementar la solución correcta más sencilla y legible.
- Reducir capas y código cuando conserva claridad, seguridad y rendimiento.
- No abstraer posibilidades especulativas.
- Cero fallbacks sintéticos presentados como datos reales.
- UI visual: capturas, comparación e interacción.
- Runtime: replays deterministas y evidencia real cuando exista la fuente.
