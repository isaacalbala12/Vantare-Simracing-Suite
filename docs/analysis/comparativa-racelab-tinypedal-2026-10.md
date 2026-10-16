# Vantare frente a RaceLab y TinyPedal — octubre de 2026

Para Isaac · [GitHub #1605](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1605) · Plane VANTA-12 · consulta: 14/10/2026.

**Investigación contrastada y medición parcial real en este PC.** RaceLab queda pendiente por Firewall/acceso sin cuenta; las cargas sin juego de TinyPedal y de demo de Vantare no permiten declarar qué aplicación consume menos en pista. Se entrega en una PR draft a `nightly`, sin modificar código ni publicar producto.

## Resumen para Isaac en diez líneas

1. RaceLab ofrece una experiencia de overlays más amplia y una comunidad de diseños compartidos.
2. TinyPedal pone mucha información técnica, combustible y planificación de neumáticos al alcance de cualquiera gratis.
3. Vantare tiene 18 tipos de widget en su aplicación nativa y un editor integrado.
4. El código actual de Vantare conecta LMU y ACC; los otros simuladores del plan todavía no cuentan como soporte disponible.
5. RaceLab anuncia ocho simuladores; TinyPedal documenta tres, incluido ACC en su versión actual.
6. RaceLab Pro cuesta 4,90 €/mes o 49,90 €/año; Vantare Pro tiene decidido 4,99 €/mes, pendiente de apertura comercial.
7. RaceLab también ofrece pago único de 399 €; TinyPedal no cobra; Vantare prevé Launch Edition de 30 € con límites distintos.
8. Nuestra oportunidad es unir overlays, análisis, estrategia y radio en un flujo sencillo que funcione en pista.
9. TinyPedal y el host QA de Vantare se midieron tres veces; RaceLab y el consumo de la suite Vantare completa quedan pendientes.
10. Conviene lanzar por calidad demostrable en LMU/ACC y facilidad de uso; aún no anunciar superioridad de rendimiento.

## Cómo leer la comparación

**Documentado** significa que una fuente oficial lo declara. **Código** significa que existe en el checkout de Vantare; no certifica que lo haya probado en una carrera. **Propuesta** significa una decisión comercial o una recomendación, no una función entregada. La ausencia de documentación se expresa como «no acreditado», sin convertirla en una prueba de inexistencia.

Para Vantare se revisó `nightly@69fa2d650c85df4184d5821ae4c032201789a1c1`. La build de prueba medida es 0.0.976, canal técnico `beta`, perfil Release, fuente `bc89c8b8400a0a7915e7496b6f339d8e8231359b`, limpio según su manifiesto y antecesor de esa nightly. No contiene necesariamente todos los cambios de la nightly actual. TinyPedal: release **2.51.0 del 03/10/2026**. RaceLab: binario instalado por T3 **8.4.4**; la nota oficial visible al investigar era 8.2.0 del 03/09/2026 y estaba atrasada respecto al instalador. [Release TinyPedal](https://github.com/TinyPedal/TinyPedal/releases/tag/v2.51.0), [notas RaceLab](https://garage.racelab.app/release-notes/).

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

Preparación real en este PC: no aparecieron RaceLab/TinyPedal en la búsqueda acotada de entradas de desinstalación de Windows; eso no descarta portables en otras carpetas. Se extrajo TinyPedal oficial y una copia de prueba de Vantare en `C:/tmp/1605-research/`. Se descargó RaceLab allí: firma Authenticode válida de Pace Engineering GmbH. T3 instaló RaceLab 8.4.4 y abrió las apps tras la corrección 01:05, pero no dejó muestras. La reanudación CLI conservó la investigación, cerró el árbol RaceLab propio y ejecutó el banco TinyPedal/host QA de Vantare sin conceder el permiso de Firewall de Windows. TinyPedal se configuró en su portable propio y APPDATA aislado; Vantare usó copia, datos, layout y pipe exclusivos bajo C:/tmp. Se desactivó únicamente la comprobación de actualizaciones de la copia de TinyPedal para evitar diálogos durante el banco. No se instalaron herramientas adicionales ni dependencias en el repo. [Artefactos y hashes](data/1605-artifacts.json).

## Consumo medido: cargas permitidas y límites

**18/27 tomas ejecutadas, nueve RaceLab pendientes.** La tabla muestra la mediana de tres repeticiones. N/M significa ausencia de medida, no cero. Las tomas son descriptivas de este PC bajo carga; no constituyen una comparación de rendimiento con la misma telemetría.

| Aplicación | Escenario | Tomas | CPU % PC | Working set MiB | Privados MiB | GPU % motor | Hilos | Primera ventana, ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vantare host QA | Residente, layout vacío | 3/3 | 0.059 | 55.9 | 93.1 | 0.000 | 24 | — |
| Vantare host QA | 4 widgets demo, sin Hub | 3/3 | 0.322 | 56.8 | 94.6 | 0.121 | 26 | — |
| Vantare host QA | Arranque hasta primera ventana visible | 3/3 | 5.445 | 37.8 | 30.3 | N/M | 21 | 347 |
| RaceLab | Reposo pendiente | 0/3 | N/M | N/M | N/M | N/M | N/M | — |
| RaceLab | 4 overlays pendientes | 0/3 | N/M | N/M | N/M | N/M | N/M | — |
| RaceLab | Arranque hasta primera ventana visible | 0/3 | N/M | N/M | N/M | N/M | N/M | N/M |
| TinyPedal | GUI sin overlays | 3/3 | 0.015 | 86.4 | 49.4 | N/M | 21 | — |
| TinyPedal | 4 overlays sin juego + GUI | 3/3 | 0.008 | 90.0 | 52.3 | N/M | 21 | — |
| TinyPedal | Arranque hasta primera ventana visible | 3/3 | 4.520 | 64.8 | 37.9 | N/M | 25 | 1167 |

Los rangos por repetición están en [resumen calculado](data/1605-summary.json), las 27 filas en [CSV](data/1605-measurements.csv) y las muestras enlazadas desde cada fila en `data/1605-raw/`. Fecha del resumen: 2026-10-14T03:09:31.633688+02:00. CPU de las cargas estables integra tiempo CPU del árbol sobre intervalos reales y los 16 procesadores lógicos; RAM/privados/hilos son medianas temporales. Después se calcula la mediana de las tres repeticiones. Working set compartido puede contarse más de una vez entre procesos; no equivale a RAM física exclusiva.

Equipo: Ryzen 7 3700X, 8 núcleos/16 procesadores lógicos; RAM utilizable 31,93 GiB; Radeon RX 7800 XT, driver 32.0.31041.1004; Windows 11 Pro build 26200. [Inventario sanitizado](data/1605-hardware.json).

### Qué se abrió y qué carga tuvo

- **TinyPedal 2.51.0:** portable propio, APPDATA/LOCALAPPDATA/TEMP aislados. Reposo: GUI con 0 widgets. Carga: Standings, Relative, Fuel y Flag habilitados, Auto Hide desactivado. Cuatro ventanas de overlay más GUI enumeradas en las tres tomas; API LMU sin simulador/datos, no demo animada. [Captura propia: 4/78 y API LMU n/a](data/1605-tinypedal-four-enabled.png). Se conservaron los módulos por defecto del preset. No se cambiaron plugins ni ajustes de juegos.
- **Vantare 0.0.976, solo host QA:** copia Release de nightly bc89c8b8 en C:/tmp. Se probó el Hub con `--demo`, rutas/pipe propios y se descartó: sin supervisor permanece en acceso, no es reposo usable de la suite. La medición válida usa únicamente `vantare-overlays --layout <layout propio> --fuente local`, ruta de QA documentada en native/ui/README.md. Reposo: layout vacío, host residente sin widgets; el feed sintético sigue activo. Carga: Standings, Relative, Fuel y stint, y Banderas, fuente local 30 Hz en una ventana por monitor. Sin Hub, núcleo live, Engineer, servicios de cuenta ni grabación. Se midió su árbol completo y se verificó la [demo de cuatro widgets en captura propia](data/1605-vantare-qa-four.png). Las cifras son del componente y **no equivalen al consumo de Vantare instalado ni de la suite completa**.
- **RaceLab 8.4.4:** instalación realizada por T3, versión FileVersion/ProductVersion comprobada al reanudar. Su sesión encontró una solicitud de Firewall Windows; no se concedió. Se cerró el árbol propio de ocho procesos de T3, incluidos KeyBindings/conhost, sin volver a abrirlo para repetir el diálogo. Acceso sin cuenta/demo/overlays no acreditado; se conservan nueve filas bloqueadas. No se midió una pantalla de permiso/login como reposo usable.

**Las cargas de overlays no son equivalentes:** TinyPedal esperaba datos y Vantare movía su demo. Coinciden cuatro familias, pero no tamaño/filas/cadencia/fuente ni oclusión. Las ventanas pueden compartir pantalla con apps ajenas; no se ocultaron ni cerraron esas apps. No convertir las diferencias de la tabla en una ventaja competitiva ni extrapolar a LMU/ACC en pista.

**PC ocupado:** había builds/tests de otros workers durante el lock. En las 12 tomas estables, la media de CPU global por toma osciló entre 59.8 % y 91.6 %; había procesos de build en el 100 % de las muestras de esas tomas. Cada muestra conserva contexto global, RAM disponible y nombres de build, sin argumentos/rutas ajenos. El lock serializó las apps de #1605/#1607; no garantizó que el resto del PC estuviera quieto. No se cerraron procesos ajenos.

### Método y ausencias

Se hicieron tres repeticiones por escenario y tres lanzamientos específicos para arranque, sin borrar cachés del sistema; son arranques con Windows y archivos ya calientes, no tres cold boots. Arranque desde Popen hasta el primer HWND propio visible, con sondeo cercano a 100 ms y timeout de 90 s. Se repitieron las seis tomas de arranque con una sonda sin PDH para evitar que sus consultas retrasasen la detección; GPU de arranque no medida. Los probes iniciales se excluyeron. En Vantare el arranque es del host QA con cuatro widgets, no del Hub. La captura/comprobación de la configuración y ventanas se hizo aparte; el cronómetro no acredita interfaz completamente usable ni primeros datos. CPU/RAM/hilos de esa fila corresponden a ese intervalo corto. Reposo y overlays: 30 s de calentamiento y 60 s con cadencia objetivo de 1 Hz; las consultas PDH pueden alargar algún intervalo y el recuento real consta en cada crudo. El programa cerró sus árboles en finally y verificó PID/fecha de creación para evitar reutilización.

GPU mediante PDH English `\GPU Engine(*)\Utilization Percentage`: atribución por PID/adaptador/motor, suma de procesos en un mismo motor y máximo entre motores; media temporal por toma. TinyPedal no publicó una instancia de motor atribuible en estas tomas: GPU N/M. No se confundió ausencia con 0 %. No hay FPS, tiempos de frame ni prueba de impacto en el juego. Fórmulas, esquema y SHA de colectores externos: [README de datos](data/README-1605.md) y [preflight actual](data/1605-preflight.json).

El bloqueo inicial por #1565 está conservado como [preflight histórico](data/1605-preflight-t3-initial.json); la corrección expresa 01:05 lo dio por cumplido. CLI renovó el lock propio antes de lanzar apps, mantuvo las copias/datos de Vantare bajo C:/tmp y liberó el lock tras cerrar todos los procesos propios. No aceptó Firewall, inició sesión, compró ni creó cuentas.

Para completar RaceLab: Isaac decide personalmente sobre Firewall y provee una vía autorizada de acceso gratuito. Para un benchmark comparable: ventana sin builds ajenas, mismo simulador/replay, fuente, cantidad de filas, tamaño y refresco; tres repeticiones y repetición A/B si se habla de efecto en FPS. [Guía oficial RaceLab](https://garage.racelab.app/docs/faq/performance_guide/).

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

En la fase T3 previa, el subagente Muse autorizado se lanzó con `xhigh`, máximo permitido por su catálogo; `max` fue rechazado. Su resultado terminal fue un mensaje de progreso sin URLs/conclusiones verificables. No se usó como fuente. La reanudación CLI no usó subagentes. La investigación incluida se contrastó directamente. [Índice de fuentes con fechas, HTTP y hashes](data/1605-sources.json); los hashes fijan las respuestas descargadas, no permiten reconstruir contenido si cambia una web.

## Qué queda pendiente y cierre de la entrega

Quedan pendientes las nueve tomas RaceLab, el consumo de la suite Vantare completa con acceso autorizado y una campaña con la misma telemetría y PC sin builds. La investigación y el banco permitido están entregados; la issue continúa abierta para revisión de esos límites. No hay prueba live ni efecto sobre FPS. Se cerraron los procesos propios TinyPedal/Vantare y el árbol RaceLab heredado, y se liberó el lock para #1607. Portables, instalación gratuita RaceLab y colectores permanecen en C:/tmp/1605-research o la instalación RaceLab creada por T3; no se desinstalaron ni se tocó Vantare real. Sin cuentas, pagos, secretos, USB, cambios de seguridad o código de producto.

Checks locales: quality check/retirement (456 huellas) PASS, parseo JSON/CSV, recálculo independiente desde muestras, 27 combinaciones únicas (18 medidas/9 bloqueadas), catálogos, hashes, enlaces, revisión completa de diff y `git diff --check`. Gates Rust locales omitidos: entrega documental con datos, sin modificar fuentes, fixtures ni comportamiento del producto. La [PR #1613](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1613) sigue draft OPEN a nightly, en rama `vantareapp/isa-1605-comparativa-racelab-tinypedal`, base original 69fa2d65. Commits/push/SHA final y checks remotos se verifican en el comentario final de [#1605](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1605). Plane VANTA-12 pasa a «Por revisar» para este informe con sus mediciones permitidas. No merge, release ni promoción; Por revisar no acredita que RaceLab ni el benchmark completo estén terminados.
