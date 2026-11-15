# Recursos del Hub Electron · VANTA-138 / #1995

La primera entrega es una línea base, sin cambios de producto. No se atribuye
ahorro a opciones que ya estaban activas: `ScreenRegistry.tsx` usa `lazy` con
`import.meta.glob` sin `eager`; `security.ts` ya fija `spellcheck: false` y
`backgroundThrottling: true`. No se cambian CSP, sandbox, fuses ni preload.

## Medición reproducible en Windows

Construir y empaquetar **QA**, desde este checkout, con Bun 1.4.4 y las
dependencias del lockfile. Nunca ejecutar esta prueba contra un Hub personal:

```powershell
$env:VANTARE_HUB_QA_BUILD='1'
bun run build
bun run package
$env:VANTARE_HUB_QA_ROOT='D:/VantareServer/qa/isa-1995-d-electron-resources'
$env:VANTARE_HUB_QA_SOURCE=(git rev-parse HEAD)
pwsh -NoProfile -File scripts/measure-resources.ps1 -Output D:/VantareServer/evidence/hub-web/isa-1995-d-electron-resources/baseline
```

Para comparar candidatos ya empaquetados, `VANTARE_HUB_UI_BINARY` selecciona
la ruta privada del ejecutable QA; el informe guarda el hash del ASAR elegido.
Usar una carpeta de salida distinta para cada ejecución.

El script toma `captura.lock` de forma exclusiva y lo libera en `finally`.
Si está ocupado, esperar fuera del script y repetir cada 60 s; no borrar un
cerrojo ajeno. El cerrojo reserva los futuros huecos nativos (#2332). Si ya hay Rust activo,
se deja terminar mediante `Enter-HubCaptureTurn` antes de abrir Electron; no se cancela nada.
No basta con crear el directorio: el helper existente posee los dos mutex de
compilación y los libera al terminar. El script Node exige la reserva del padre. Cada sesión dura aproximadamente tres minutos.

Se abre un único candidato QA con el núcleo simulado, perfil nuevo y sin red.
Se miden cinco ventanas de 20 s: Inicio recién abierto, Inicio tras recorrer
las secciones implementadas y sus pestañas disponibles, e Inicio minimizado; después Calendario visible y minimizado.
Cada medición comprueba primero el recorrido y minimizar/restaurar en un
perfil aparte, dentro de la misma reserva; también puede ejecutarse solo con `-CheckOnly`; ese
informe lleva `checkOnly: true` y no contiene cifras de consumo. Electron no implementa los comandos de ventana de Browser en
CDP: minimizar/restaurar usa únicamente el HWND del candidato, tras verificar
ejecutable, título y propietario. El script comprueba IsIconic/IsWindowVisible y `document.hidden` real.
Playwright activa la emulación de foco al conectar; el guion conecta con
`noDefaults: true` para no habilitarla ni modificar fuentes o preferencias
de medios. Así minimizar no se presenta falsamente como una página visible. Cada invocación
crea su propio perfil QA, incluso si se repite dentro de una reserva.

El recorrido queda enumerado: no se afirma haber visitado diálogos, widgets
nativos o futuros módulos bloqueados. Se usan condiciones de carga y foco,
no una espera fija para simular que la interfaz está lista.

Cada segundo se conservan PID + inicio del proceso (evita mezclar PID
reutilizados), rol main/renderer/GPU/utility/other, memoria privada comprometida,
working set y CPU. CPU se deriva del tiempo de procesador y tiempo real medido;
el informe distingue porcentaje de un núcleo de porcentaje de toda la máquina.
La primera muestra no tiene delta: es `null`, no un cero ficticio. No se guardan
líneas de comandos; solo se consultan para clasificar procesos de este árbol.
No se fuerza GC o vaciado de cachés para bajar las cifras. No se mide VRAM dedicada ni el consumo del núcleo/residente.
Working set incluye páginas compartidas: **su suma no es
RAM física exclusiva**. `privateBytes` tampoco equivale a RAM residente.

`report.json` contiene medias y máximos por proceso, recorrido, SHA del candidato
y hash ASAR, viewport, versión de Chromium y contexto de RAM/CPU de Windows. Los JSON de cada fase conservan muestras crudas. El proceso de
medición/Playwright queda fuera del árbol medido; CDP y el mock sí añaden coste
al Hub. Comparar antes/después con igual candidato QA, perfil, recorrido,
instrumentación y estado de ventana. No extrapolar a una sesión real con Rust.

## Línea base observada · 15-11-2026

Una pasada, QA simulado en el servidor compartido: Chromium 156.0.8078.80, 1440 × 900, DPR 1, 8 procesadores lógicos. Fuente del producto `b18a3618d`; el código del producto no se modificó.

Medias en MiB: **privada / working set**, sin sumar working sets compartidos.

| Proceso (PID)    |        Inicio | Tras recorrido | Inicio minimizado | Calendario visible | Calendario minimizado |
| ---------------- | ------------: | -------------: | ----------------: | -----------------: | --------------------: |
| Main (6096)      |  47.7 / 102.2 |   45.2 / 104.6 |      43.5 / 103.1 |       42.9 / 102.6 |          42.8 / 102.6 |
| Renderer (4196)  |  58.8 / 109.1 |  108.8 / 168.8 |      89.5 / 150.4 |       86.4 / 148.0 |          89.5 / 151.4 |
| GPU (8544)       | 153.1 / 127.9 |  189.5 / 133.0 |     135.6 / 131.3 |      174.7 / 140.6 |         142.3 / 138.5 |
| Utilidad (10668) |   11.5 / 43.3 |    11.5 / 43.4 |       11.4 / 43.3 |        11.3 / 43.2 |           11.3 / 43.2 |

CPU media de los intervalos, normalizada a toda la máquina: renderer tras el recorrido **0,007 %**; las demás ventanas/procesos registraron 0 al nivel de resolución de estas muestras. No significa coste nulo permanente.

El recorrido, módulos JS y muestras crudas están en `D:/VantareServer/evidence/hub-web/isa-1995-d-electron-resources/baseline-v8/` (`report.json`). Se observaron 807 nodos en Inicio inicial, 831 después y 333 en Calendario. Es el caso `inicio-base` del mock, no una prueba de máximo contenido ni del núcleo real.

ASAR SHA-256: `19419552c8c84e012b8f44165c1901a759cd585b083c91f19ce361cde353c37c`. Las cinco fases verificaron visibilidad antes y después; el previo sin muestras verificó también minimizar/restaurar. Los intentos anteriores incompletos NO son la línea base.

La caída natural de memoria entre fases mezcla tiempo, GC y cachés: no se atribuye toda a minimizar ni constituye una optimización. Antes de concluir sobre diferencias pequeñas, repetir pares alternados en el PC de juego.

## Cómo interpretar y seguir

Repetir tres veces en el PC de juego, sin juego ni compilaciones, antes de
concluir sobre pequeñas diferencias. Registrar RAM disponible, aplicaciones
en segundo plano y si se usa escritorio remoto. El servidor compartido solo
da una orientación: carga, presión de RAM y RDP pueden alterar working set,
CPU y proceso GPU. Una ventana de 20 s no detecta pérdidas a largo plazo.

Después de la línea base, revisar el grafo del bundle y consumidores globales:
que exista `lazy` no garantiza que un import global no cargue otra sección.
Para oculto/minimizado, separar reloj visual y suscripciones de alta frecuencia
de servicios necesarios (cierre, cuenta, avisos y lanzamientos programados).
No apagar indiscriminadamente listeners del anfitrión. Cada optimización lleva
la misma medición antes/después y pruebas de reanudación sin duplicación.

## Propuesta de producto: renderer durante la carrera (sin implementar)

Hoy `ui_tick.rs` fuerza el cierre por `Live`, el cliente responde sin vetos y
`main/index.ts` termina al cerrar todas las ventanas; destruir el contenido
también desconecta el host. **Ya se cierra el Hub completo al entrar en pista**.
La propuesta siguiente cambiaría ese ciclo de vida, no una opción de Chromium.

**Recomendación provisional:** conservar el cierre completo actual (menor coste
en carrera) y medir la reapertura. Si Isaac quiere conservar servicios propios
del Hub en segundo plano, la alternativa es destruir solamente `BrowserWindow`,
dejando main + anfitrión y residente vivos; consume más que el cierre completo.
Destruir el
`webContents` libera el renderer; minimizarlo no garantiza esa liberación.
GPU/utility pueden seguir vivos: medirlo, no prometer que desaparecen.

Para volver, main crea una ventana nueva y reconecta con una foto vigente del
host, pasando otra vez por las guardas de cuenta/derechos. El estado confirmado
se relee; no se reproducen peticiones inciertas ni órdenes de lanzamiento.
Hay que decidir el gesto de reapertura (segunda instancia/acceso directo o
bandeja); la bandeja sería alcance adicional, no existe por esta propuesta.

Se pierde el estado exclusivamente visual: pestaña, scroll, foco, búsquedas,
diálogos y borradores no confirmados. Antes de adoptar esta opción hay que
inventariar qué borradores ya se guardan y qué cierre prioritario admite GPUI;
no se puede prometer guardar todo al entrar en pista. Los diálogos nativos de
exportación/confirmaciones y las decisiones del residente necesitan una política
explícita: nunca tratar una ventana destruida como aceptación.

También requiere decidir si main sin ventana cuenta como «Hub abierto» para
avisos y temporizadores. Hoy la condición de producto es Hub abierto; retener
servicios después de cerrar la ventana podría cambiarla. El cierre solicitado
por el usuario debe seguir terminando todo y desarmando lo que corresponda.
La alternativa conservadora es mantener la ventana minimizada y dormir solo
el trabajo visual: menos ahorro potencial, sin reconstruir la sesión gráfica.
Isaac decide entre ambas tras medir; este PR no implementa ninguna transición.
