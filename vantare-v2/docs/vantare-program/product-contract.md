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

Durante el mes de apertura de la **beta pública**, del 26-oct-2026 19:00 al
26-nov-2026 19:00 Europe/Madrid (apertura inclusiva, cierre exclusivo), nuestro
checkout aplica automáticamente un descuento Polar de duración **`once`** sobre
el producto normal. No se crean productos recurrentes a precio reducido:

| Plan | Primer periodo | Renovaciones | Descuento fijo una vez |
|---|---:|---:|---:|
| Pro mensual | 3,99 EUR | 5,99 EUR/mes | 2,00 EUR |
| Pro anual | 39,90 EUR | 59,99 EUR/año | 20,09 EUR |
| Pro Plus mensual | 6,99 EUR | 9,99 EUR/mes | 3,00 EUR |
| Pro Plus anual | 69,90 EUR | 99,90 EUR/año | 30,00 EUR |

El código de creador **sí puede acompañar al lanzamiento**: atribuye la venta,
pero no rebaja el primer periodo. El checkout inicial lleva solo el `discount_id`
de lanzamiento si corresponde y metadata `creator_code`; sin campaña cobra normal.
El servidor valida el código exacto y guarda la atribución ligada al intento y
al checkout. Metadata editable por sí sola nunca acredita atribución ni identidad.
Tras confirmar el primer pago, aplica el **20 % desde la primera renovación**,
con GET/PATCH/ACK durable e incidencia Owner si falla. No modifica la factura pagada.
Duración única configurable en `polar-launch-prices.json.creator_renewals`:
mensual `repeating` 11 meses desde su primera renovación rebajada (meses 2–12);
anual `repeating` 12 meses para una renovación anual (el primer año no se rebaja
por creador). No se reaplica ni reinicia al repetir el webhook. Códigos Polar
públicos desactivados: los cupones de renovación se aplican solo por API.
Comisión sin cambios: 30 % mes 1, 10 % meses 2–12 sobre lo pagado; pago manual.
La comisión anual sigue esa ventana temporal, no se amplía por el descuento anual.

**Riesgo aceptado por Isaac (16-oct-2026):** cualquier persona que conozca un
código activo puede usarlo. No está limitado a una persona ni a la campaña de
lanzamiento: mientras siga activo y configurado, atribuye ventas y concede el
20 % desde renovación durante el tramo mensual/anual indicado. Su difusión
puede aumentar las ventas con descuento y comisiones; es el modelo autorizado.

Si se reembolsa el pago de origen o una factura de esa suscripción, o se revoca
la suscripción, se retira el descuento de creador de sus renovaciones. El
registro es durable e idempotente; fallo de Polar deja incidencia Owner y
reintento. No se elimina un descuento ajeno de informes/manual ni se devuelve
ningún importe automáticamente. La comisión conserva sus reglas históricas.

**Decisión de Isaac (16-oct-2026): el programa de premios por informes de
VANTA-39 no se abre con el lanzamiento; se anunciará más adelante.** Queda
desactivado por defecto, sin ventana de inscripción fijada. La ventana futura
será propia del programa y se definirá cuando se anuncie; no deriva del
26-oct→26-nov de la oferta inicial ni inscribe automáticamente a sus compradores.
Flag operativo apagado y configuración SQL privada deshabilitada, con fechas
sin fijar; encender solo el flag no concede inscripciones.

Se conserva preparada la mecánica Pro/Pro Plus mensual: 45 días (1080 horas)
desde el alta individual, apertura inclusiva y cierre exclusivo de la ventana
que se apruebe. No se anuncia fecha ni se activa la campaña en esta entrega.
Esta decisión sustituye la propuesta anterior de inscripción durante todo el
mes de lanzamiento. La oferta inicial de #1661 conserva su propio contrato.

Los descuentos por informes de VANTA-39 y creador comienzan después del primer
periodo. No se suman: gana el mayor ahorro en céntimos sobre el precio normal;
empate para informes. Se registra el otro como no aplicado. Pro: informes 200 c
frente a creador 120 c; Plus: 300 c frente a 200 c. La integración con #1593 debe
usar un único escritor y preservar saldo/caducidad de ambos derechos, sin
reiniciar cupones al cambiar de ganador. Véase el [contrato de integración](../billing/creator-renewals-1661.md).
No hay trial con lanzamiento ni atribución de creador. Pro normal mantiene su
trial configurado; Pro Plus y Founders no tienen trial. Los descuentos por
informes se aplican **desde el segundo mes**, no el primer día por comprar.

Este modelo sustituye los productos de lanzamiento permanentes de #1620.
Los IDs históricos se conservan para lectura/reembolso, pero no se seleccionan
para nuevos checkouts. El script prepara productos normales, cuatro descuentos
`once` con fechas y, si se pide, el descuento de creador separado. Crear catálogo
no abre por sí solo ventas ni prueba despliegue; la contabilidad de creadores
sigue sin pagos automáticos. Compra web coordinada en VANTA-42.

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
- Incluye canales **Stable y Nightly** de forma vitalicia. No concede roles Owner/tester.
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

### VANTA-83 · disputas y reembolsos (Isaac, 16-oct-2026)

**O1 confirmado:** una disputa/contracargo retira permanentemente el 20 % de
creador de esa suscripción cuando Polar notifica su revocación/cancelación
inmediata o el reembolso equivalente. Se usa la misma retirada durable e
idempotente, sin retirar descuentos ajenos; fallo visible en Owner.
**O3 confirmado:** cualquier reembolso confirmado de cualquier factura de esa
suscripción, parcial incluido y aunque no sea la factura de origen, retira ese
20 %; no afecta a otras suscripciones del cliente. No se restaura automáticamente
si se gana la disputa o se reactiva la suscripción. No se efectúa ningún reembolso.

Polar no expone actualmente eventos públicos `dispute.*`; no se inventa esa
suscripción de webhook. Una disputa abierta sin revocación ni reembolso no llega
por estos eventos. Véase el runbook de creador para señales, fuentes y pruebas
pendientes en sandbox (O2).
