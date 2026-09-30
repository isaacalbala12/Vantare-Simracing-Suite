# Vantare: mercado, crecimiento y objetivos de una persona

Fecha de corte: 23/09/2026. Tarea operativa: [Notion](https://app.notion.com/p/3e4e51695c6581c58ff2e8e314ca9c4f). Puente técnico: [GitHub #1341](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1341). Este documento es una investigación y un modelo de decisión, no una cifra observada de usuarios o ventas de Vantare.

## Decisión para el primer año

Isaac quiere estudiar **todo el simracing desde el inicio**, sin limitar la estrategia de marca a LMU ni al público hispanohablante. Este universo incluye PC y consolas, aunque las fuentes comparables encontradas cubren sobre todo PC. El **mercado servible hoy** depende de las compatibilidades verificadas en la aplicación: el contrato y la campaña actuales describen LMU en Windows. La extensión a otros simuladores se cuenta en el escenario alto solo después de que funcione, se pruebe y se anuncie correctamente. Hablar a toda la comunidad desde el primer día no convierte a los pilotos de otras plataformas o simuladores en usuarios activables del producto actual.

La decisión práctica es medir un embudo de Vantare, no aplicar al producto un porcentaje arbitrario del tamaño del sector. Sin un recuento único y comparable de pilotos activos de PC por simulador, **no existe un “crecimiento máximo del mercado” numérico defendible**. Sí existen anclas públicas de escala y un escenario alto condicional para Vantare.

## Datos comprobables y límites

| Dato | Fuente primaria y fecha del dato | Qué permite decir | Qué no permite decir |
| --- | --- | --- | --- |
| LMU superó **500.000 copias del juego base** acumuladas; en marzo de 2026 superó **8.800 jugadores concurrentes** en un pico. | [Motorsport Games, resultados Q2 2026](https://motorsportgames.com/motorsport-games-reports-second-quarter-2026-financial-results/), consultado el 23/09/2026. | Hay una base global relevante para la primera compatibilidad. | Las copias no son jugadores activos ni el pico es audiencia mensual. No hay un techo de propietarios en 500.000 porque la fuente dice *más de*. |
| LMU alcanzó **100.000 ventas netas** en Q4 2024. | [Motorsport Games, resultados FY 2024](https://ir.motorsportgames.com/news-releases/news-release-details/motorsport-games-reports-fourth-quarter-full-year-2024-financial), consultado el 23/09/2026. | Las ventas acumuladas de ese título crecieron al menos cinco veces hasta el dato de 2026. | No es una tasa anual repetible ni una previsión del número de usuarios activos. |
| iRacing indicó **más de 350.000 simracers activos** en agosto de 2025. | [iRacing y Cosworth](https://www.iracing.com/cosworth-and-iracing-unite-to-redefine-data-analysis-in-sim-racing/), consultado el 23/09/2026. | Un solo simulador de PC tiene cientos de miles de usuarios activos. | No se puede sumar a LMU: personas, periodos y definiciones se solapan o difieren. Tampoco es mercado servible hasta tener integración verificada. |
| RaceLab declara **más de 50.000 usuarios activos** en overlays multisimulador y anuncia Pro a **4,90 €/mes**. | [RaceLab, página oficial](https://racelab.app/), consultada el 23/09/2026. | Existe demanda observada para una herramienta de esta categoría y un precio comparable. | No son compradores de pago, usuarios disponibles para Vantare ni una estimación del mercado total. Es una afirmación comercial propia, sin definición pública de “activo”. |
| Vantare documenta Free, Pro **4,99 €/mes**, Pro Plus **9,99 €/mes** y Launch Edition **30 €** una vez. | `docs/vantare-program/product-contract.md` y plan de lanzamiento vigente, consultados el 23/09/2026. | Da el precio contractual con el que simular MRR; Polar controla las transacciones reales. | El precio escrito no prueba que checkout esté abierto, que haya ventas o que el ingreso medio sea 6,49 €. |
| Audiencia personal inicial: YouTube **2.360** e Instagram **562** a 22/09; las cuentas de Vantare parten de cero. Dedicación: **6 h/semana** de marketing y **0 €** de anuncios nuevos. | Plan operativo `marketing/2026-09-lanzamiento/PLAN.md` y estrategia del 22/09/2026. | Existe una vía de distribución propia y un límite de trabajo explícito. | Seguidores no son visitas cualificadas, personas únicas ni ventas. No se suman como mercado alcanzable. |

Se descartaron titulares de “mercado global del simracing” que mezclan hardware, juegos, competición y espectadores: no miden compradores de software de overlays. No se estimó TAM en euros multiplicando jugadores por el precio de Vantare, porque la compatibilidad, el uso de overlays y la disposición a pagar no están medidos. El **techo defendible por ahora es cualitativo**: mercado de PC de cientos de miles como mínimo en simuladores relevantes; categoría de overlays con al menos un competidor que declara decenas de miles de activos. El techo de una empresa de una persona será menor y depende de soporte y calidad.

### Línea base interna verificable

Una lectura agregada y de solo lectura del proyecto Supabase activo de Vantare el **23/09/2026** obtuvo **8 cuentas** en `auth.users`, **1 cuenta con inicio de sesión en los últimos 30 días**, **4 dispositivos** en `devices`, de los cuales **2** tienen `last_seen_at` en ese periodo. Inicio de sesión y presencia de dispositivo son señales operativas; **no demuestran que se abriera un overlay ni que se terminara una sesión de carrera**. Ninguna de las ocho cuentas fue creada en los últimos 30 días.

La proyección comercial contiene **3 suscripciones Polar con estado `active`, todas en entorno `legacy`**, sin `provider_price_id` ni `paid_through` futuro. Los **3 clientes Polar** carecen de entorno clasificado; el ledger de pedidos y devoluciones, y la bandeja de webhooks, no tienen filas. Estos datos **no permiten contar tres compradores actuales ni calcular MRR real**. Su estado en el futuro panel será “sin fuente comercial verificada”, no 0 €. Esta línea base es interna, de muestra mínima y no se usa para estimar tasas de mercado o conversión.

## Embudo y escenarios a doce meses

Horizonte: los doce meses posteriores a una apertura pública verificada. Unidad inicial: **visitas con intención** a la página de Vantare desde pilotos de simulación de PC; contarlas con una definición y fuente consistentes, deduplicando cuando sea posible. Todavía no existen cifras observadas de este embudo. Los tres casos siguientes son **hipótesis de planificación**, no predicciones estadísticas ni compromisos comerciales.

Fórmulas: `primeras sesiones = visitas × tasa de primera sesión`; `retornos D7–13 = primeras sesiones con cohorte madura × tasa de retorno`; `adquisiciones de pago = retornos × tasa de pago`; `suscripciones activas al cierre = adquisiciones × factor de permanencia`; `MRR bruto modelado = suscripciones activas × precio mensual medio`. Los retornos de cohortes todavía inmaduras quedan pendientes, no se convierten en fracasos. El modelo supone, por prudencia, que la compra llega después del retorno; un piloto puede comprar antes en la realidad.

| Supuesto o resultado | Prudente | Central de trabajo | Alto condicionado |
| --- | ---: | ---: | ---: |
| Visitas con intención en 12 meses **(supuesto)** | 600 | 2.400 | 6.000 |
| Primera sesión / visita **(supuesto)** | 10 % | 15 % | 20 % |
| **Primeras sesiones modeladas** | 60 | 360 | 1.200 |
| Retorno D7–13 / primera sesión madura **(supuesto)** | 20 % | 35 % | 50 % |
| **Retornos modelados** | 12 | 126 | 600 |
| Pago / retorno **(supuesto)** | 10 % | 15 % | 20 % |
| Adquisiciones de suscripción modeladas | 1,2 | 18,9 | 120 |
| Permanencia media hasta cierre **(supuesto)** | 75 % | 75 % | 75 % |
| **Suscripciones activas al cierre, valor esperado** | 0,9 | 14,2 | 90 |
| **MRR bruto al cierre, valor esperado** | 6 € | 92 € | 584 € |

El precio medio **supuesto** es `0,70 × 4,99 € + 0,30 × 9,99 € = 6,49 €/mes`, antes de impuestos, comisiones, descuentos y cambios de plan. Los decimales son valores esperados de un cálculo, no fracciones de cliente; la operación real se presentará como personas enteras y cobros de Polar. Las compras únicas de Launch Edition se muestran aparte y no se añaden al MRR. La permanencia del 75 % es un supuesto provisional, **no una tasa de retención observada**.

El caso alto exige suficiente distribución orgánica, un recorrido de instalación eficaz, soporte sostenible y, probablemente, más compatibilidades verificadas. No representa el máximo matemático. En la categoría, un 1 % de los **50.000** activos que declara RaceLab equivaldría aritméticamente a **500** personas; no es una cuota que Vantare pueda reclamar ni una previsión de captación, y ni siquiera esas personas serían todas servibles con LMU solo.

### Sensibilidad del caso central

En esta sensibilidad concreta, **las visitas y la tasa de pago producen los mayores cambios probados en MRR**. Estos cálculos cambian un factor a la vez y no implican independencia real entre factores.

| Cambio único sobre el caso central | Primeras sesiones | MRR bruto modelado al cierre |
| --- | ---: | ---: |
| 1.200 visitas en vez de 2.400 | 180 | 46 € |
| 4.800 visitas en vez de 2.400 | 720 | 184 € |
| 10 % de primera sesión en vez de 15 % | 240 | 61 € |
| 20 % de primera sesión en vez de 15 % | 480 | 123 € |
| 7,5 % de pago en vez de 15 % | 360 | 46 € |
| 30 % de pago en vez de 15 % | 360 | 184 € |

En cada cálculo se conservó `retorno = 35 %`, `permanencia = 75 %` y `precio medio = 6,49 €`, salvo el factor cambiado. El modelo no presupone inversión publicitaria, compra de seguidores ni un calendario extra de contenido.

## Objetivos de los primeros 90 días públicos

Los 90 días empiezan **cuando la descarga pública y el checkout, si se usa para objetivos de pago, estén verificados**. La fecha deseada del 5/10/2026 no inicia por sí sola el reloj. El objetivo ya acordado de **10 primeras sesiones públicas confirmadas en el primer mes** se conserva. Para la revisión de día 90 propongo estas puertas de aprendizaje:

| Señal a día 90 | Meta de trabajo | Decisión |
| --- | --- | --- |
| Visitas con intención | 300 registradas con fuente y definición; si faltan, informar cobertura | Saber si el problema es descubrimiento o instalación. |
| Primeras sesiones públicas confirmadas | 45 acumuladas, de ellas al menos 10 en el primer mes | Si hay interés pero pocas primeras sesiones, mejorar descarga, guía y primer overlay. |
| Retorno D7–13 | Buscar 35 % de cohortes maduras con resultado conocido; mostrar también todas las cohortes maduras, el número de desconocidos y la fracción mínima confirmada | Si no hay retorno o la cobertura es baja, priorizar observación y uso repetido antes de multiplicar canales. |
| Opiniones directas | Registrar las respuestas explícitas disponibles y clasificar hasta tres fricciones recurrentes; no fijar cuota de formularios | Escoger un cambio de producto comprobable por ciclo. |
| Pago | 2 compradores recurrentes como **señal exploratoria solo si checkout está operativo**; MRR real según Polar, sin meta monetaria artificial | Validar el recorrido y razones de compra; si checkout no está listo, estado “no disponible”. |
| Capacidad | Mantener 6 h semanales de marketing; registrar además el tiempo de soporte y los pendientes | Si el soporte desplaza la mejora de producto o el contenido, bajar volumen y corregir la causa. |

En un embudo hipotético de 300 visitas × 15 % × 35 % × 15 % se obtienen 45 primeras sesiones, 15,75 retornos y 2,36 adquisiciones de pago como **valores esperados**; la meta de 2 compradores es una prueba temprana, no una previsión de caja. No se atribuyen retornos D7–13 a las cohortes que aún no llegan al día 13.

La revisión se hace semanalmente dentro del bloque existente de marketing. Asana sigue organizando las piezas. Reutilizar una demostración principal y sus cortes en los canales personales y de Vantare evita crear seis producciones diferentes. En cada revisión, registrar **minutos reales, fuente de visitas, primeras sesiones, cohortes maduras, preguntas repetidas y cobros Polar**; cambiar una sola variable de mensaje o distribución por semana. Seguidores y visualizaciones sirven para explicar alcance, no reemplazan primeras sesiones, retorno ni pago.

## Cómo sustituir los supuestos

1. Al reunir las primeras **20 primeras sesiones confirmadas**, recalcular tasas de instalación/primera sesión y registrar causas de abandono. El objetivo es aprender, no declarar precisión estadística con una muestra pequeña.
2. Cuando haya **20 cohortes maduras con resultado conocido**, mostrar la tasa D7–13 con su cobertura. Los no observados siguen como desconocidos, especialmente antes de la analítica voluntaria.
3. Cuando Polar confirme los primeros cobros de producción, medir compradores únicos, suscripciones activas, MRR por plan, compras únicas y reembolsos. Separar sandbox de producción. Sin acceso a una lectura reconciliada, no mostrar cero.
4. Tras una compatibilidad nueva probada, recalcular mercado servible y embudo por simulador. No extrapolar la conversión LMU a iRacing, ACC u otros sin datos.
5. Antes de usar el caso alto como plan, medir minutos de soporte por primera sesión y capacidad semanal real de Isaac; reducir el objetivo si el volumen compromete estabilidad o atención.

La mayor limitación hoy es la falta de datos propios de visitas, sesiones repetidas, tiempo de soporte y ventas verificadas. Por ello el caso central es **una hipótesis para tomar decisiones semanales**, no el “crecimiento esperado” con respaldo estadístico. La primera versión de la web privada debe enseñar estos supuestos al lado de los datos reales y permitir revisar sus fechas.
