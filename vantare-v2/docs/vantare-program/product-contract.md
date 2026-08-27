# Contrato de producto Vantare

Estado: decisiones confirmadas por Isaac hasta 2026-08-27.

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

Un companion Mac podrá mostrar en el futuro un stream efímero y opt-in de
telemetría live ya aceptada por el único runtime Windows. No será una segunda
autoridad de Vantare: no adquiere LMU, no calcula estado de producto y no
sincroniza ni exporta cuenta, ajustes, estrategias o datos persistidos.

## Usuarios y lanzamiento

El producto sirve a pilotos casuales, competitivos y de resistencia. El primer
lanzamiento comercial es directo, precedido por una prueba cerrada corta. No
hay beta pública abierta.

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
- Standings y Pedals.
- Vantare Original.
- Vantare Crystal con marca Vantare integrada y no eliminable.
- Overlay Studio limitado a los widgets gratuitos.

### Vantare Pro — 4,99 EUR/mes

- Toda la aplicación publicada en Stable.
- Soporte en Discord.

### Vantare Pro Plus — 9,99 EUR/mes

- Todo Pro.
- Acceso a Nightly/Beta privada, tests, encuestas y previews activas.

### Launch Edition — 30 EUR una vez

- Acceso de por vida a los módulos existentes al comprar y sus mejoras.
- Los módulos completamente nuevos pueden venderse aparte.
- Acceso a tests/encuestas/builds de testers, pero no Nightly.
- Engineer se considera incluido en la edición inicial.

Crystal pierde la marca con cualquier licencia de pago. Relative, Delta y los
demás widgets no gratuitos requieren licencia.

## Billing

- Polar es la autoridad comercial.
- Supabase permanece como backend de cuenta/licencia endurecido.
- Stripe se retira cuando Polar esté operativo y reconciliado.
- Trial de siete días con método de pago y recordatorio.
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
