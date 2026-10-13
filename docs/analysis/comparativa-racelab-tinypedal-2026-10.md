# Vantare frente a RaceLab y TinyPedal — octubre de 2026

Para Isaac · [GitHub #1605](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1605) · Plane VANTA-12 · consulta: 14/10/2026.

**Entrega parcial: investigación contrastada; mediciones del PC bloqueadas.** Este documento no permite declarar qué aplicación consume menos. Se entrega en una PR draft a `nightly`, sin modificar código ni publicar producto.

## Resumen para Isaac en diez líneas

1. RaceLab ofrece una experiencia de overlays más amplia y una comunidad de diseños compartidos.
2. TinyPedal pone mucha información técnica, combustible y planificación de neumáticos al alcance de cualquiera gratis.
3. Vantare tiene 18 tipos de widget en su aplicación nativa y un editor integrado.
4. El código actual de Vantare conecta LMU y ACC; los otros simuladores del plan todavía no cuentan como soporte disponible.
5. RaceLab anuncia ocho simuladores; TinyPedal documenta tres, incluido ACC en su versión actual.
6. RaceLab Pro cuesta 4,90 €/mes o 49,90 €/año; Vantare Pro tiene decidido 4,99 €/mes, pendiente de apertura comercial.
7. RaceLab también ofrece pago único de 399 €; TinyPedal no cobra; Vantare prevé Launch Edition de 30 € con límites distintos.
8. Nuestra oportunidad es unir overlays, análisis, estrategia y radio en un flujo sencillo que funcione en pista.
9. El consumo sigue sin medir: las reglas nocturnas exigen un FIN de #1565 posterior a medianoche y esa señal no está verificada.
10. Conviene lanzar por calidad demostrable en LMU/ACC y facilidad de uso; aún no anunciar superioridad de rendimiento.

## Cómo leer la comparación

**Documentado** significa que una fuente oficial lo declara. **Código** significa que existe en el checkout de Vantare; no certifica que lo haya probado en una carrera. **Propuesta** significa una decisión comercial o una recomendación, no una función entregada. La ausencia de documentación se expresa como «no acreditado», sin convertirla en una prueba de inexistencia.

Para Vantare se revisó `nightly@69fa2d650c85df4184d5821ae4c032201789a1c1`. La build preparada, pero no abierta, es 0.0.976, canal técnico `beta`, perfil Release, fuente `bc89c8b8400a0a7915e7496b6f339d8e8231359b`, limpio según su manifiesto y antecesor de esa nightly. No contiene necesariamente todos los cambios de la nightly actual. TinyPedal: release **2.51.0 del 03/10/2026**. RaceLab: última nota oficial visible **8.2.0 del 03/09/2026**; no es una comprobación de versión instalada. [Release TinyPedal](https://github.com/TinyPedal/TinyPedal/releases/tag/v2.51.0), [notas RaceLab](https://garage.racelab.app/release-notes/).

## Tabla de funciones

| Función | Vantare: código actual | RaceLab: documentado | TinyPedal: documentado |
| --- | --- | --- | --- |
| Posiciones, rivales y delta | Standings, Relative, multiclase, torre, Delta, historial y cara a cara | Posiciones, rivales, delta, mapas y comparación de vueltas | Posiciones, rivales, delta, sectores e historial |
| Pedales y conducción | Pedales, entradas y trazas de pedales | Telemetría de entradas y comparación de referencias | Pedal, trazas, volante, deslizamiento y frenada |
| Coche, pista y carrera | Daños visuales/detallados, radar, mapas, clima, banderas y vuelta rápida | Clima, radar/avisos, boxes, energía, banderas y bloques configurables | Daños, neumáticos, frenos, suspensión, energía, clima y pronóstico |
| Editor | Studio: añadir/mover widgets, apariencia, deshacer/rehacer y visibilidad por sesión | Ventanas individuales o diseños completos; selección automática por coche/serie | Presets, arrastrar/bloquear y configuración de cada widget |
| Telemetría y análisis | Grabación local opcional y análisis de series guardadas | Gráficos de vueltas, entradas y Series; algunas comparaciones se limitan a iRacing | Gráficos live e históricos locales de vueltas/consumo; no acreditado un analizador general equivalente al de Vantare |
| Estrategia | Planificador local: combustible/energía, stints, paradas, pilotos, clima y reglas; cálculo puede quedar sin óptimo demostrado | Calculadora y combustible compartido con equipo; no acreditado un solver integral | Calculadora de combustible/energía y planificador manual de neumáticos con exportación CSV |
| Ingeniero de radio | Engineer/Spotter Beta: avisos con calidad/frescura y clips locales; cobertura acústica completa no verificada aquí | No acreditado ingeniero propio; puede lanzar Crew Chief mediante Tools Manager | Notas de audio por posición en pista; no acreditado ingeniero/spotter integral |
| Comunidad y equipos | No acreditada biblioteca pública de layouts ni combustible sincronizado entre pilotos | Biblioteca comunitaria, etiquetas de rivales, combustible de equipo | Presets/archivos locales; no acreditado servicio de sincronización de equipo |
| VR y controles externos | No acreditada integración OpenXR/OpenVR o plugin Stream Deck en esta revisión | VR Pro condicionada por juego/runtime; integración Stream Deck | No acreditada VR nativa comparable; atajos configurables |
| Sistemas | Producto Windows 10/11; soporte de desarrollo en otros sistemas no implica distribución equivalente | Cliente Windows según fuentes consultadas | Windows y Linux, con condiciones/plugins diferentes |

Fuentes de la tabla: [catálogo RaceLab](https://racelab.app/), [layouts RaceLab](https://garage.racelab.app/docs/faq/layout-vs-overlay/), [Tools Manager](https://garage.racelab.app/docs/advanced-features/tools-manager/), [VR RaceLab](https://garage.racelab.app/docs/vr/compatibility/), [Stream Deck](https://garage.racelab.app/docs/stream-deck/), [guía TinyPedal](https://github.com/TinyPedal/TinyPedal/wiki/User-Guide). Vantare: [registro de widgets](../../vantare-v2/native/ui/src/registry.rs), [Studio](../../vantare-v2/native/hub/README.md), [Strategy](../../vantare-v2/native/strategy/README.md), [Engineer](../../vantare-v2/native/engineer/README.md), [Analysis](../../vantare-v2/docs/vantare-program/handoffs/telemetry-analysis.md). La documentación Engineer conserva referencias a DTO antiguos; se usa para alcance y límites, sin tratar esas versiones como autoridad actual del transporte.

### Qué widgets tiene cada uno

**Vantare:** 18 tipos registrados: Standings, Radar, Pedales, Delta, Daños del coche, Telemetría de entrada, Relative multiclase, Torre de posiciones, Historial de delta, Mapa del circuito, Tiempo en pista, Daños detallados, Cara a cara, Fuel y stint, Telemetría de pedales, Relative, Banderas y Vuelta rápida. Evidencia: `vantare-v2/native/ui/src/registry.rs:138`.

**RaceLab:** el catálogo consultado presenta 30 overlays: Standings, Relative, Fuel Calculator, Input Telemetry, Delta Trace, Track Map, Advanced Panel, Flags, Head to Head, Race Schedule, Flat Map, Overtake Alert, Boost Box, Blind Spot Indicator, Data Blocks, Delta, Heart Rate, Horizontal Standings, G-Force Meter, Laptime Graph, Laptime Log, Laptime Spread, Minimap, Pitbox Helper, Session Timer, Radar, Radar Bars, Weather Monitor, Digiflag y Leaderboard. Los subbloques de Data Blocks no son otros tantos overlays independientes. [Catálogo oficial](https://racelab.app/).

**TinyPedal:** la guía presenta 78 apartados de widgets. Se agrupan en posiciones/rivales, vueltas/sectores, conducción/frenada, energía/combustible, neumáticos, mecánica, mapas/clima y diagnóstico. La lista completa está en [datos del catálogo](data/1605-catalog-tinypedal.json). Un apartado de documentación no demuestra que todas sus señales estén disponibles en los tres juegos. [Guía oficial](https://github.com/TinyPedal/TinyPedal/wiki/User-Guide).

### Simuladores: disponibilidad frente al plan

| Simulador | Vantare nativo revisado | RaceLab anunciado | TinyPedal 2.51.0 |
| --- | --- | --- | --- |
| Le Mans Ultimate | Adaptador existente; no prueba live nueva | Sí | Sí |
| Assetto Corsa Competizione | Adaptador existente; no prueba live nueva | Sí | Sí |
| iRacing | En el plan; sin adaptador nativo en esta base | Sí | No en lista oficial |
| Assetto Corsa 2014 | En el plan; sin adaptador nativo en esta base | Sí | No en lista oficial |
| Assetto Corsa EVO | En el plan; sin adaptador nativo en esta base | No en lista consultada | No en lista oficial |
| Automobilista 2 | En el plan; sin adaptador nativo en esta base | Sí | No en lista oficial |
| rFactor 2 | Sin adaptador nativo en esta base | Sí | Sí |
| RaceRoom | Sin adaptador nativo en esta base | Sí | No en lista oficial |
| F1 | Sin adaptador nativo en esta base | Sí; comprobar edición concreta | No en lista oficial |

Vantare: `vantare-v2/native/runtime/src/adapter/mod.rs:7` y `runtime/src/bin/vantare-core.rs:67`; el [contrato de producto](../../vantare-v2/docs/vantare-program/product-contract.md) enumera prioridades futuras. RaceLab: [plataformas y alcance por overlay](https://racelab.app/). TinyPedal: [README de la release revisada](https://github.com/TinyPedal/TinyPedal/blob/v2.51.0/README.md). RaceLab no ofrece cada overlay en cada simulador: por ejemplo, Leaderboard/Race Schedule son de iRacing y Radar no lista LMU/ACC, aunque otras ayudas espaciales sí.

## Tabla de precios

| Producto / plan | Precio mostrado o decidido | Qué incluye / límites | Estado de la evidencia |
| --- | --- | --- | --- |
| RaceLab Basic | 0 € | Incluye Relative, telemetría y clasificación básicas; personalización limitada | Web oficial y ayuda emergente del plan comprobadas |
| RaceLab Professional mensual | 4,90 €/mes | Catálogo completo y funciones Pro | Tarifa pública; compra no realizada |
| RaceLab Professional anual | 49,90 €/año | Pro; equivale a unos 4,16 €/mes, con pago anual | Cálculo 49,90/12; no es una cuota mensual independiente |
| RaceLab Lifetime | 399 € una vez | Acceso de por vida anunciado | Condiciones detalladas no contratadas |
| RaceLab Commercial | 299 €/puesto/año | Uso comercial y funciones por puesto | Oferta separada para centros/negocios |
| TinyPedal | 0 € | Aplicación completa; código GPL-3.0-or-later | Sin plan de pago en documentación consultada |
| Vantare Gratis | 0 € previsto | Hub/Launcher, básico de calendario/cuenta, Standings/Pedales y Studio limitado; Crystal con marca | Decisión de producto; no venta/apertura certificada |
| Vantare Pro | 4,99 €/mes previsto | Toda la aplicación publicada en Stable | Decisión; gates comerciales pendientes |
| Vantare Pro Plus | 9,99 €/mes previsto | Pro y acceso Nightly/Beta privada y pruebas | Decisión; no equivale a más overlays en Stable |
| Vantare Launch Edition | 30 € una vez previsto | Módulos existentes al comprar y mejoras; nuevos módulos pueden venderse aparte; testers, sin Nightly | Decisión; alcance distinto a Lifetime de RaceLab |

Fuentes: [precios RaceLab](https://racelab.app/?anchor=membership), [licencia TinyPedal](https://github.com/TinyPedal/TinyPedal/blob/v2.51.0/LICENSE.txt), [precios decididos Vantare](../../vantare-v2/docs/vantare-program/product-contract.md). Se transcriben importes en euros, sin asumir impuestos incluidos ni calcular un checkout que no se abrió. RaceLab anuncia ahorro anual de 8,90 € frente a 58,80 € en doce mensualidades: supone **15,1 %**, aunque su tarjeta dice 10 %; para comparar conviene usar los importes.

La diferencia mensual entre Pro de Vantare y RaceLab es solo **0,09 €**. No basta como argumento de compra. TinyPedal compite con precio cero y muchas funciones. La ayuda del plan RaceLab confirma tres familias gratuitas; también limita Tools Manager a tres herramientas y deja VR/funciones avanzadas en Pro. La lista básica es ilustrativa, no una lista exhaustiva de permisos comprobados en la app. [Planes oficiales](https://racelab.app/?anchor=membership), [Tools Manager](https://garage.racelab.app/docs/advanced-features/tools-manager/).

## Instalación y actualizaciones

| Producto | Instalación documentada | Actualización / condiciones |
| --- | --- | --- |
| Vantare | Setup de Windows por usuario, sin administrador; conserva documentos y usa generaciones | Feed firmado y vuelta a la versión anterior si el nuevo Hub no confirma arranque; depende del canal y servicio de distribución |
| RaceLab | Instalador oficial; la web pide cuenta para empezar. LMU requiere su plugin, con configuración automática o manual | Changelog público activo; mecanismo exacto de actualización no verificado en la app |
| TinyPedal | Descargar ZIP, extraer en carpeta limpia y ejecutar; sin cuenta en el procedimiento. Windows LMU/ACC no requieren plugin externo; rF2 sí | Avisa de nuevas versiones, pero no descarga/instala automáticamente; actualización manual desde GitHub |

Fuentes: [packaging Vantare](../../vantare-v2/native/packaging/README.md), [instalador RaceLab](https://download.racelab.app/RacelabApps-installer.exe), [configuración LMU RaceLab](https://garage.racelab.app/docs/first-steps/lmu/), [README TinyPedal](https://github.com/TinyPedal/TinyPedal/blob/v2.51.0/README.md), [actualizaciones TinyPedal](https://github.com/TinyPedal/TinyPedal/wiki/User-Guide#application). ACC necesita configurar UDP para datos adicionales; LMU exige activar plugins del juego. No se cambiaron los simuladores del PC.

Preparación real en este PC: no aparecieron RaceLab/TinyPedal en la búsqueda acotada de entradas de desinstalación de Windows; eso no descarta portables en otras carpetas. Se extrajo TinyPedal oficial y una copia de prueba de Vantare en `C:/tmp/1605-research/`. Se descargó RaceLab allí: firma Authenticode válida de Pace Engineering GmbH. **No se ejecutó el instalador ni se abrió ninguna de las tres aplicaciones.** No se instalaron herramientas adicionales ni dependencias en el repo. [Artefactos y hashes](data/1605-artifacts.json).

## Tabla de consumo: medición pendiente

**N/M = no medido; no significa cero.** Ninguna mediana se puede calcular con cero repeticiones ejecutadas.

| Aplicación | Escenario solicitado | Tomas ejecutadas / previstas | CPU % PC | RAM MiB | GPU % motor | Hilos | Arranque hasta listo, ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vantare | Reposo | 0/3 | N/M | N/M | N/M | N/M | — |
| Vantare | 3–4 overlays equivalentes | 0/3 | N/M | N/M | N/M | N/M | — |
| Vantare | Arranque | 0/3 | N/M | N/M | N/M | N/M | N/M |
| RaceLab | Reposo | 0/3 | N/M | N/M | N/M | N/M | — |
| RaceLab | 3–4 overlays equivalentes | 0/3 | N/M | N/M | N/M | N/M | — |
| RaceLab | Arranque | 0/3 | N/M | N/M | N/M | N/M | N/M |
| TinyPedal | Reposo | 0/3 | N/M | N/M | N/M | N/M | — |
| TinyPedal | 3–4 overlays equivalentes | 0/3 | N/M | N/M | N/M | N/M | — |
| TinyPedal | Arranque | 0/3 | N/M | N/M | N/M | N/M | N/M |

Equipo inventariado, sin pruebas de carga: Ryzen 7 3700X, 8 núcleos/16 procesadores lógicos; RAM utilizable reportada 31,93 GiB; Radeon RX 7800 XT, driver 32.0.31041.1004; Windows 11 Pro build 26200. [Hardware crudo sanitizado](data/1605-hardware.json).

### Qué impidió medir

`C:/tmp/buzon/REGLAS-NOCHE-1014.md` ordena: «No midas mientras C:/tmp/buzon/1565.md no tenga una línea FIN posterior a las 00:00 del 14/10». En las comprobaciones realizadas, el archivo de #1565 tenía FIN sin fecha en la línea y última escritura **13/10/2026 23:16:08**. No acredita el FIN exigido para esta noche. Se registró BLOQUEO en el buzón propio y se continuó con lo permitido. No se creó ni borró `pc-medicion.lock`. [Preflight con fecha y hashes](data/1605-preflight.json).

Además, esta sesión no expone controles de escritorio nativo para comprobar e interactuar con las ventanas; el navegador colaborativo sirve para webs. La shell sí accede al PC y permitió el inventario y las descargas. No se presenta una captura web como prueba de overlays visibles. La reanudación necesita una vía de interacción/verificación de escritorio disponible.

Hay límites adicionales que deben resolverse al abrir las apps: RaceLab pide cuenta en su flujo documentado y se prohíbe crear una; no se usó una identidad de Isaac. Su FAQ explica que sin juego los overlays abiertos no renderizan datos; no acredita que no exista preview, pero obliga a verificarlo. TinyPedal permite desactivar Auto Hide, lo que no demuestra una demo con telemetría móvil. Vantare sí documenta fuente sintética local a 30 Hz. **No se utilizó demo ni simulador para ninguna toma.** [FAQ RaceLab](https://racelab.app/faq/), [guía TinyPedal](https://github.com/TinyPedal/TinyPedal/wiki/User-Guide#overlay), [fuente local Vantare](../../vantare-v2/native/ui/README.md).

### Protocolo para completar las 27 tomas

1. Verificar un FIN nuevo con fecha posterior al corte; reservar `pc-medicion.lock` con #1605 y hora. Respetar locks menores de dos horas. Mantener la exclusividad con #1607 y comprobar que no hay builds pesadas.
2. Abrir solo copias propias. En Vantare, fijar datos, raíz y nombre de pipe únicos bajo `C:/tmp`; usar `--data-dir`, `VANTARE_NATIVE_DATA_ROOT` y `VANTARE_BETA_ROOT` según el modo. Nunca ejecutar el Setup normal sobre la instalación de Isaac. Verificar rutas efectivas y permisos antes de abrir.
3. Comprobar acceso gratuito sin registrar cuenta ni pagar. Si RaceLab no deja pasar sin login, registrar bloqueo de ese producto. No medir una pantalla de login como si fueran overlays.
4. Preferir **tres** overlays compartidos: clasificación, rivales y entradas de pedales; mismos tamaños, filas, pantalla y refresco cuando sea configurable. Vantare: Standings/Relative/Input Telemetry; RaceLab: Standings/Relative/Input Telemetry básico; TinyPedal: Standings/Relative y la traza de entradas equivalente. Un cuarto solo si está gratis en los tres. Confirmar visualmente el contenido antes de medir.
5. Reposo: app lista sin overlays visibles. Overlays: 30 s de calentamiento y 60 s de muestras a 1 Hz. Arranque: medir desde lanzamiento hasta interfaz utilizable; conservar también CPU/RAM/GPU/hilos durante esa ventana. Sin simulador, usar demo oficial si existe y etiquetar fuente/cadencia; no comparar demo animada contra ventanas vacías como carga equivalente.
6. Incluir todos los procesos hijos atribuibles a cada app, incluidos renderers y servicios. CPU: tiempo de CPU consumido dividido por tiempo real y 16 procesadores lógicos; 100 % significa todo el PC. RAM: suma de working set, junto a bytes privados para advertir memoria compartida. Hilos: suma por árbol. No sumar memoria de procesos ajenos.
7. GPU: contadores Windows por PID, adaptador y motor; informar el motor más ocupado, sin sumar indiscriminadamente motores que corren a la vez. Conservar valores por motor y procesos; si no hay contador, N/M. La composición de DWM y la pérdida de FPS requieren una prueba adicional y no se deducen de ese porcentaje.
8. Repetir tres veces cada escenario con cierre confirmado entre repeticiones; rotar orden de productos. Para reposo/overlays, resumir cada ventana con media CPU/GPU y mediana RAM/hilos; dar la mediana de los tres resúmenes. Arranque: mediana de tres tiempos, indicar caché templada y no llamarlo arranque frío.
9. Guardar muestras con tiempo relativo, métricas, versión/hash, tamaño/configuración y modo, evitando nombres/rutas/telemetría personal. Capturar solo ventanas de prueba con datos ficticios. Cerrar exclusivamente PIDs propios y liberar el lock al acabar o abortar.

Los [27 registros previstos](data/1605-measurements.csv) tienen estado `NOT_RUN` y métricas vacías. Son un registro de pendientes, **no datos de consumo**. La [guía de rendimiento RaceLab](https://garage.racelab.app/docs/faq/performance_guide/) también propone comparar el mismo replay con/sin overlays; eso sería una segunda campaña para comprobar efecto en el juego.

## Qué tienen ellos que nosotros no

- **RaceLab: alcance práctico de simuladores y ecosistema.** Más juegos anunciados, biblioteca de layouts, VR y controles externos. El alcance exacto depende del juego y plan. No se encontraron equivalentes implementados para todo ello en Vantare revisado. [Layouts](https://garage.racelab.app/docs/faq/layout-vs-overlay/), [VR](https://garage.racelab.app/docs/vr/compatibility/), [Stream Deck](https://garage.racelab.app/docs/stream-deck/).
- **RaceLab: cooperación de equipo y referencias de iRacing.** Compartir combustible e información global de rivales aporta valor que nuestros archivos locales no sustituyen. [Funciones oficiales](https://racelab.app/).
- **TinyPedal: amplitud técnica gratuita.** La guía recoge detalles de ruedas, frenos y suspensión que no aparecen como widgets específicos en nuestros 18 tipos. También ofrece una herramienta explícita para gestionar neumáticos. [Guía](https://github.com/TinyPedal/TinyPedal/wiki/User-Guide).
- **TinyPedal: distribución Linux y código abierto.** Es una alternativa completa sin cuota. Nuestro soporte de desarrollo fuera de Windows no equivale a ese producto distribuido. [Release](https://github.com/TinyPedal/TinyPedal/releases/tag/v2.51.0), [README](https://github.com/TinyPedal/TinyPedal/blob/v2.51.0/README.md).
- **Entrada gratuita más amplia.** RaceLab deja probar Relative y telemetría básica; TinyPedal elimina el límite de plan. Vantare prevé solo Standings y Pedales gratis. [Planes RaceLab](https://racelab.app/?anchor=membership), [contrato Vantare](../../vantare-v2/docs/vantare-program/product-contract.md).

## Dónde ganamos, y qué falta demostrar

**Ventaja de alcance de nuestra suite:** análisis local, planificación de carrera y Engineer comparten producto con Studio y Launcher. El solver considera más dimensiones que una simple calculadora de combustible. Es una diferencia verificable del código frente a lo documentado de los rivales, pero falta demostrar el flujo completo y su utilidad en pista. [Strategy](../../vantare-v2/native/strategy/README.md), [Hub](../../vantare-v2/native/hub/README.md).

**Ventaja potencial de la oferta de lanzamiento:** 30 € por los módulos existentes resulta una entrada atractiva frente a 399 € por Lifetime de RaceLab. Los derechos tienen alcance distinto y TinyPedal sigue siendo gratis. Es una propuesta comercial, no una oferta pública abierta ni una comparación de prestaciones equivalentes. [Contrato](../../vantare-v2/docs/vantare-program/product-contract.md).

**Fortalezas propias:** Studio tiene deshacer/rehacer y filtros por sesión; TinyPedal advierte que su editor de notas y planificador de neumáticos no ofrecen undo. Vantare distingue datos fiables, estimados y ausentes en su núcleo/radio. Esto ayuda a una experiencia honesta, pero no se investigaron todos los controles internos de los competidores para afirmar superioridad en exactitud. [Studio](../../vantare-v2/native/hub/README.md), [Engineer](../../vantare-v2/native/engineer/README.md), [guía TinyPedal](https://github.com/TinyPedal/TinyPedal/wiki/User-Guide).

**No hay victoria de rendimiento demostrada.** Rust/GPUI, número de procesos o comentarios de usuarios no sustituyen la medición comparable.

## Cinco recomendaciones para el lanzamiento

| Prioridad | Recomendación para Isaac | Cómo decidir si está lista |
| --- | --- | --- |
| 1 | Comunicar LMU/ACC como alcance actual; separar los demás juegos del plan | Una carrera de prueba de cada juego con posiciones, entradas, combustible, radio y cierre revisados |
| 2 | Decidir si el nivel gratuito debe incluir Relative para facilitar la prueba | Decisión comercial explícita y prueba del recorrido gratuito completo; este informe no cambia licencias |
| 3 | Lanzar un diseño inicial útil y fácil de ajustar antes de ampliar el catálogo | Usuario nuevo instala y coloca tres overlays sin ayuda; anotar tiempo, errores y pasos confusos |
| 4 | Mostrar el valor integrado con un caso de resistencia: analizar → planificar → avisar | El plan usa datos de la sesión y explica límites; avisos coherentes y audibles en una sesión real, sin rellenar datos ausentes |
| 5 | Completar el banco de consumo antes de anunciar que Vantare es más ligero | 27 tomas comparables, medianas y muestras crudas; añadir replay A/B y tiempos de frame si se habla de FPS |

Son recomendaciones, no nuevas tareas ejecutadas ni funciones prometidas para una fecha. La biblioteca pública y la VR quedan como oportunidades posteriores sujetas a decisión; no se propone copiarlas durante este encargo.

## Reseñas, Discord y calidad de fuentes

Se consultaron [reseñas públicas de LMU](https://www.reddit.com/r/LeMansUltimateWEC/comments/1w3b40z/are_overlays_worth_it_on_lmu_and_is_there_any/): describen utilidad de TinyPedal y opiniones dispares sobre fluidez/VRR. Se resumieron sin usuarios, citas personales ni imágenes. Son experiencias sin control de hardware/configuración; no se convirtieron en porcentajes. [Comparación PickMerit del 30/09/2026](https://pickmerit.com/blog/sim-racing-overlays-and-huds-free-vs-paid) coincide con precios/plataformas oficiales de RaceLab, pero declara relación con otra herramienta competidora y no funciona como benchmark independiente.

Se abrió la [invitación oficial del Discord de RaceLab](https://discord.com/invite/h4Sc4M7). La respuesta pública consultada no expone mensajes de canales; no se inició sesión, se unió un usuario ni se consultó el Discord privado del PC. No se pudo revisar conversaciones de Discord. Para TinyPedal se usaron documentación, releases y fuentes públicas de su proyecto; no se identificó aquí un Discord oficial público verificable.

El subagente Muse autorizado se lanzó con `xhigh`, máximo permitido por su catálogo; `max` fue rechazado. Su resultado terminal fue un mensaje de progreso sin URLs/conclusiones verificables. No se usó como fuente. La investigación incluida se contrastó directamente. [Índice de fuentes con fechas, HTTP y hashes](data/1605-sources.json); los hashes fijan las respuestas descargadas, no permiten reconstruir contenido si cambia una web.

## Qué queda pendiente y cierre de la entrega

Pendientes: señal horaria válida de #1565, acceso/verificación de escritorio, instalación efectiva de RaceLab sin cuenta, demos/carga comparable, 27 mediciones y medianas. No hay capturas de apps, pruebas live ni efectos sobre FPS. Los instaladores/portables preparados permanecen en `C:/tmp/1605-research/`; ninguna app de prueba quedó abierta porque ninguna se lanzó. Se cerró únicamente la pestaña web propia al entregar. No se tocaron instalación/datos de Vantare de Isaac, cuentas, pagos, secretos ni USB.

Checks de esta entrega documental: JSON/CSV y enlaces locales, consistencia de catálogo, revisión de diff y `git diff --check`. No se recompiló ni ejecutaron gates Rust: no cambió código y la campaña de carga está bloqueada. No hay merge, release ni promoción. La issue permanece abierta; «Por revisar» significa revisión de esta entrega parcial, no finalización de la comparativa medida.
