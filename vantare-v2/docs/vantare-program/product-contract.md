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

El lanzamiento debe incluir Hub, Launcher, Overlay Studio, los widgets
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

### Vantare Pro — 5,99 EUR/mes o 59,90 EUR/año

- Precios normales con IVA incluido; catálogo preparado en ISA-1499/1620,
  sin certificar venta ni ejecución Polar.
  Mensual y anual conceden exactamente las mismas capabilities.
- Toda la aplicación publicada en Stable.
- Soporte en Discord.

### Vantare Pro Plus — 9,99 EUR/mes o 99,90 EUR/año

- Todo Pro.
- Acceso a Nightly/Beta privada, tests, encuestas y previews activas.

Campaña preparada en [#1620](../billing/isa-1620-polar-launch-catalog.md),
decisión ronda 3 del 14/10/2026: productos propios de lanzamiento Pro
3,99 EUR/mes o 39,90 EUR/año, Plus 6,99 EUR/mes o 69,90 EUR/año.
Un código exacto por creador (ISAAC), -20 % porcentual, repeating 2 meses,
solo sobre esos cuatro productos; luego vuelve a la base de lanzamiento.
Mensual: 3,19/5,59 EUR los dos primeros meses, 3,99/6,99 desde mes 3.
Anual: primera factura 31,92/55,92 EUR, renovación 39,90/69,90.
Decisión B de Isaac del 14/10/2026: los cuatro productos de lanzamiento,
incluidos los accesos por enlace/código de creador, **no tienen prueba gratis**;
el primer cobro ocurre al comprar. Los siete días gratis son exclusivos de
Pro a precio normal, mensual/anual; Pro Plus normal tampoco tiene trial.
Tras el mes de lanzamiento se retiran sus ofertas de la web y se conservan
los productos accesibles por enlace de creador propio. Activación y cambio
web pendientes; el catálogo no publica ni certifica venta. El checkout de la
app conserva los productos normales. Normales y lanzamiento conceden los
mismos derechos por plan/ciclo; Plus mensual y anual comparten canales.
Comisión contable sobre lo pagado: 30 % mes 1, 10 % meses 2–12 mientras siga
suscrito; después se renegocia. Sin payouts automáticos.

Protección de #1620 R1: las ofertas de creador requieren cambios de plan del
portal deshabilitados y bloqueo operativo de cambios administrativos/programados
mientras siga vigente el descuento. El scope solo restringe su aplicación
inicial; no elimina descuentos heredados al cambiar producto. Configuración
y verificación real pendientes, según el runbook enlazado.

### Founders — 50 EUR una vez

- Plan propio: todos los módulos y widgets presentes y futuros, para siempre.
- Venta del 26-oct-2026 a las 19:00 al 26-nov-2026 a las 19:00 Europe/Madrid;
  fechas configurables en servidor, apertura inclusiva y cierre exclusivo.
- La transición desde suscripción queda bloqueada de forma conservadora para
  evitar otro cobro; Isaac debe validar el procedimiento, sin cancelación automática.
- Implementación preparada en VANTA-83/#1661; no certifica activación comercial.
  [Contrato, configuración e integración web](../billing/founders-1661.md).

### Launch Edition — 30 EUR una vez

- Acceso de por vida a los módulos existentes al comprar y sus mejoras.
- Los módulos completamente nuevos pueden venderse aparte.
- Acceso a tests/encuestas/builds de testers, pero no Nightly.
- Engineer se considera incluido en la edición inicial.

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
