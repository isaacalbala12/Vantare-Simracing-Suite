# Inteligencia de producto y crecimiento de Vantare

Decisión aprobada por Isaac el 23/09/2026. Issue de diseño: #1338. Esta especificación describe entregas futuras; no afirma que la consola, el formulario general ni la analítica de uso estén publicados.

## Propósito y límites

Una sola persona debe poder decidir cada semana si mejora la primera sesión, el retorno, la oferta o la distribución. Los dos resultados principales son **pilotos que vuelven a usar Vantare** e **ingresos recurrentes**. Ambos se muestran por separado. Las ventas únicas de Launch Edition y los cobros netos se muestran aparte de MRR.

El primer segmento es pilotos de Le Mans Ultimate en Windows. La expansión a otros simuladores se modela después de verificar disponibilidad y uso reales. La capacidad de marketing vigente es 6 h por semana y 8 h en la semana objetivo de apertura, sin publicidad ni nuevas suscripciones en el plan base. Asana conserva la planificación de contenido; la consola no crea un segundo calendario editorial.

Fuentes que controlan este diseño:

- `docs/vantare-program/product-contract.md`: aplicación local-first, cero telemetría de producto por defecto, consentimiento revocable y Polar como autoridad comercial.
- `docs/vantare-program/handoffs/platform-commercial.md` y `supabase/migrations/20260802120000_billing_order_refund_ledger.sql`: Billing proyecta pedidos, suscripciones y reembolsos en Supabase. El snapshot BIL-10 mide salud operativa, no ingresos.
- Issue #764: falta una decisión ejecutable sobre analítica de uso y su control en Ajustes. Esta especificación define la dirección de producto; la implementación requiere su propio corte.
- Plan de lanzamiento de Vantare del 22/09/2026: meta provisional de diez primeras sesiones públicas confirmadas en el primer mes, seguimiento D7–13 y 6 h semanales de marketing. No son datos observados ni previsiones.

## Arquitectura

```text
Vantare (opinión enviada voluntariamente; eventos de uso solo con opt-in)
    → Supabase (identidad, feedback y proyecciones operativas)
Polar (autoridad de pedidos, suscripciones y reembolsos)
    → integración Billing existente → proyección comprobada en Supabase
Supabase → API privada de Cloudflare Worker → web privada de Isaac
Fuentes públicas y métricas de canales → modelo fechado → web privada
```

La web usa Cloudflare Workers Static Assets para interfaz y API. Cloudflare Access limita el hostname a la identidad exacta de Isaac. La API valida criptográficamente el token de Access y su audiencia en cada solicitud de datos; la ruta alternativa del Worker no puede saltarse ese control. Los secretos de Supabase o Polar existen solo en el servidor y el navegador recibe únicamente respuestas acotadas. El primer corte no crea D1 ni copia tablas completas a Cloudflare.

Supabase mantiene la fuente operativa. Para el panel se crea una lectura server-side de mínimo privilegio que entrega agregados y opiniones necesarias, separa `sandbox` de `production`, limita rangos y devuelve fecha de actualización, cobertura y estado de reconciliación. Ningún fallo de lectura transforma «no disponible» en cero. Las consultas financieras no modifican cobros, licencias, reembolsos ni reconciliación.

## Modelo mínimo de medición

| Indicador | Definición y fuente | Decisión que permite |
| --- | --- | --- |
| Primera sesión confirmada | Persona única que completa una sesión real de LMU con al menos un overlay de Vantare; confirmación observada, respuesta explícita o futuro evento consentido. Testers y público en cohortes separadas. | Detectar fricción de acceso o instalación. |
| Retorno D7–13 | Personas de cohorte madura con otra sesión confirmada entre los días 7 y 13 desde la primera; mostrar elegibles, confirmados, quienes declaran no volver y desconocidos. La fracción confirmada es una cota inferior si falta observación. | Priorizar utilidad repetida. |
| Clientes de pago | Clientes únicos con compra o suscripción pagada confirmada por Polar en producción, netos de estados anulados según el contrato comercial. | Comprobar conversión real. |
| MRR contratado | Suma mensual de suscripciones de pago vigentes según el estado y precio de Polar al cierre; excluir Free, pruebas y Launch Edition. Mostrar moneda y fecha de corte. No equivale a cobros del mes. | Seguir la base recurrente. |
| Cobros netos | Pedidos pagados menos reembolsos confirmados del periodo, por moneda y entorno; reportar suscripciones y compras únicas por separado. No se llaman ingresos contables. | Entender caja comercial sin confundirla con MRR. |
| Capacidad | Minutos reales de marketing por primera sesión confirmada y peticiones de soporte pendientes. Si no hay activaciones, mostrar minutos sin dividir por cero. | Elegir una carga sostenible. |

Las cifras pequeñas se presentan como personas y fracciones junto a cualquier porcentaje. Cada tarjeta indica fuente, ventana temporal, última actualización y límites de cobertura. La web muestra tres estados diferentes: `0`, `desconocido` y `fuente no disponible`.

## Pantallas de la web privada

- **Resumen:** dos resultados principales (retorno y MRR), primeras sesiones, cobros netos, opiniones nuevas y aviso de fuentes desactualizadas. Cada tarjeta abre su definición y el periodo que la produjo.
- **Uso:** embudo de primera sesión y cohortes D7–13, con testers separados, asistencia indicada y cobertura de consentimiento. El primer corte admite un registro manual auditado; los eventos automáticos se incorporan después.
- **Negocio:** suscripciones, MRR, compras únicas, reembolsos y estado de reconciliación, con cambio explícito entre sandbox y producción.
- **Opiniones:** bandeja de lectura, filtros y estados; solo el texto enviado explícitamente por el piloto.
- **Crecimiento:** piezas y canales, tiempo invertido, origen declarado/UTM, interesados y primeras sesiones confirmadas; carga semanal limitada por el plan de Asana.
- **Mercado y objetivos:** fuentes fechadas, supuestos editables, escenarios y seguimiento a 90 días. Las estimaciones se rotulan como tales y nunca se mezclan con métricas observadas.

La primera versión visible reúne Resumen, Negocio y Opiniones, con Uso manual básico. Crecimiento y Mercado se incorporan desde los artefactos de investigación una vez revisados. En móvil se prioriza lectura y triage; el modelo de supuestos puede editarse desde escritorio.

## Opiniones dentro de la app

Una entrada accesible desde Ayuda/Ajustes a usuarios Free y de pago permite enviar **problema**, **idea** o **experiencia**. El usuario escribe texto, puede elegir si acepta una respuesta y ve una vista previa del paquete: categoría, mensaje, versión, canal y datos técnicos mínimos. El envío ocurre solo al pulsar Enviar. No se adjuntan logs, perfiles, archivos de carrera, nombres de rivales, voz ni rutas por defecto.

La web privada ofrece una bandeja con fecha, tipo, versión, texto y estados `nuevo`, `revisado`, `acción creada` y `cerrado`. Isaac puede enlazar una opinión a una issue sin publicar el mensaje original ni datos personales. El primer corte admite filtrado y cambio de estado, no automatización de respuestas. La confirmación al piloto no promete un plazo de resolución. La app muestra los envíos propios y permite borrarlos; el texto libre se elimina automáticamente a los 180 días. Tras el borrado solo pueden conservarse recuentos agregados sin identidad ni texto. La issue técnica incluirá pruebas de ambos caminos de eliminación antes de publicar el formulario.

El feedback de candidatas del Testing Center conserva su finalidad de validación técnica. El panel de roadmap con enlaces externos no se reutiliza como si ya almacenara opiniones generales.

## Datos de uso y consentimiento

La primera entrega usa confirmaciones manuales y fuentes existentes. La instrumentación automática es un corte posterior ligado a #764. Su conjunto inicial de eventos será pequeño: primera sesión cualificada, sesión cualificada posterior y módulo usado a nivel de categoría. Una sesión cualificada exige una señal de uso real verificable por el runtime; una apertura de la app o una descarga no cuentan. La issue técnica identificará el productor exacto y lo protegerá con tests antes de enviar eventos.

El envío automático requiere consentimiento específico, desactivado por defecto, versionado y revocable. Se aplica el contrato de inspección, pausa, historial y borrado remoto de `product-contract.md`. Los paquetes tienen allowlist cerrada: identificador seudónimo, versión, canal, simulador, categoría de módulo y tiempo agregado necesario para cohortes. Se excluyen telemetría de carrera, posiciones, otros pilotos, rutas, voz, estrategias y texto de opiniones. La web muestra la cobertura del opt-in y no extrapola la muestra consentida a toda la base de usuarios.

## Investigación del sector y objetivos

El estudio produce un modelo editable y fechado, con enlaces a fuentes originales y una columna que distingue hecho, estimación y supuesto. Calcula tres magnitudes distintas:

1. **Techo del segmento inicial:** pilotos potenciales de LMU en Windows que podrían usar software de este tipo. La concurrencia de Steam no se tratará como usuarios únicos mensuales. Se contrastarán cifras oficiales, distribución y competencia; si faltan datos, se dará un intervalo.
2. **Crecimiento esperable a 12 meses:** escenarios prudente, central y alto mediante un embudo desde alcance cualificado hasta primera sesión, retorno y pago. Las tasas sin histórico serán supuestos explícitos y se sustituirán por cohortes observadas.
3. **Objetivos operativos de 90 días:** hitos de uso e ingresos que una persona pueda atender. Se comprobarán contra las 6 h semanales de marketing, el tiempo de soporte y la disponibilidad comercial real. El techo de capacidad de Isaac se reporta separado del tamaño de mercado.

La meta existente de diez primeras sesiones públicas en el primer mes sigue siendo provisional hasta la primera revisión. No se fija una cifra de MRR sin checkout verificado, población alcanzable y datos de conversión. La investigación entrega un escenario con sensibilidad a tamaño del segmento, exposición, activación, retorno, conversión a pago y carga de soporte; el mayor factor incierto determina la siguiente prueba de validación.

## Crecimiento con una sola persona

Asana sigue siendo la fuente de piezas y fechas. Se reutiliza una captura principal para los canales personales y oficiales, con un único destino de ayuda/acceso. Una revisión semanal dentro de las 6 h registra tiempo real, interesados, primeras sesiones, retornos maduros, ventas confirmadas y preguntas repetidas. Se cambia una sola variable de distribución o mensaje cada semana. Web/SEO, comunidades y recomendaciones se prueban solo cuando una señal de usuarios justifique desplazar una pieza existente.

Seguidores, reproducciones y clics explican alcance. La decisión de continuar un canal se apoya en interesados cualificados, primeras sesiones y, cuando existan, clientes de pago. Un origen autodeclarado y un UTM verificado son evidencias distintas; origen desconocido sigue siendo desconocido.

## Entregas y criterios de cierre

1. **Contrato y base:** este diseño, diccionario de métricas, inventario de fuentes, estudio de mercado inicial y registro manual de cohortes. Cierre: cada cifra visible tiene fuente y definición.
2. **Feedback explícito:** entrada en la app, almacenamiento privado, bandeja de revisión y borrado propio/automático. Cierre: un piloto Free y uno de pago pueden enviar una opinión, verla confirmada, encontrarla en la bandeja y eliminarla; los intentos no autorizados fallan.
3. **Consola comercial:** web privada Cloudflare con resúmenes de uso manual y lectura financiera server-side de Polar/Supabase. Cierre: Access y la API rechazan identidades ajenas; sandbox/production no se mezclan; MRR, cobros y compras únicas se reconcilian con casos de cancelación y refund.
4. **Analítica opt-in:** eventos mínimos reales y cohortes automáticas. Cierre: consentimiento, revocación, pausa, inspección y borrado remoto pasan pruebas de privacidad; sin opt-in no sale ningún evento.
5. **Revisión 30/60/90 días:** actualizar escenarios y objetivos con datos observados. Cierre: Isaac elige una prioridad de producto y una de distribución dentro de su capacidad.

Cada entrega de código tendrá issue, rama y worktree propios desde `nightly`, tests focales y revisión. Ningún borrador de PR equivale a integración, promoción o release. La web y las migraciones se prueban con datos de prueba antes de cualquier conexión de producción.

## Auto-revisión

El diseño no presupone clientes, ingresos, despliegue o métricas de uso existentes. La fase Ecosistema permanece futura. La primera entrega puede funcionar con confirmaciones manuales y Polar verificado mientras se resuelve #764; no depende de una captura automática silenciosa. Los cortes de feedback, consola comercial y eventos tienen una finalidad y frontera propias.
