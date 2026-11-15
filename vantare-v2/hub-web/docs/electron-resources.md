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

El script toma `captura.lock` de forma exclusiva y lo libera en `finally`.
Si está ocupado, esperar fuera del script y repetir cada 60 s; no borrar un
cerrojo ajeno. El cerrojo reserva los futuros huecos nativos (#2332). Si ya hay Rust activo,
se deja terminar mediante `Enter-HubCaptureTurn` antes de abrir Electron; no se cancela nada.
No basta con crear el directorio: el helper existente posee los dos mutex de
compilación y los libera al terminar. El script Node exige la reserva del padre. Cada sesión dura aproximadamente tres minutos.

Se abre un único candidato QA con el núcleo simulado, perfil nuevo y sin red.
Se miden cinco ventanas de 20 s: Inicio recién abierto, Inicio tras recorrer
las secciones implementadas y sus pestañas disponibles, e Inicio minimizado; después Calendario visible y minimizado.
El recorrido queda enumerado: no se afirma haber visitado diálogos, widgets
nativos o futuros módulos bloqueados. Se usan condiciones de carga y foco,
no una espera fija para simular que la interfaz está lista.

Cada segundo se conservan PID + inicio del proceso (evita mezclar PID
reutilizados), rol main/renderer/GPU/utility/other, memoria privada comprometida,
working set y CPU. CPU se deriva del tiempo de procesador y tiempo real medido;
el informe distingue porcentaje de un núcleo de porcentaje de toda la máquina.
La primera muestra no tiene delta: es `null`, no un cero ficticio. No se guardan
líneas de comandos. Working set incluye páginas compartidas: **su suma no es
RAM física exclusiva**. `privateBytes` tampoco equivale a RAM residente.

`report.json` contiene medias y máximos por proceso, recorrido, SHA del candidato
y hash ASAR. Los JSON de cada fase conservan muestras crudas. El proceso de
medición/Playwright queda fuera del árbol medido; CDP y el mock sí añaden coste
al Hub. Comparar antes/después con igual candidato QA, perfil, recorrido,
instrumentación y estado de ventana. No extrapolar a una sesión real con Rust.

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

**Opción recomendada para evaluar:** destruir solamente `BrowserWindow` al
entrar en pista, dejando main + anfitrión y residente vivos. Destruir el
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
