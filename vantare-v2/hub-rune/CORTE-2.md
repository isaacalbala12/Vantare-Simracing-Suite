# Corte 2 · guion de medición

VANTA-143 / Refs #2256. Preparado sin ejecutar gráficos. Depende del código de
Inicio #2297, Studio #2306 y Launcher #2307. El primer trabajo al recuperar el
Mac sigue siendo la comparativa pendiente de #2297, offscreen y sin foco.

| Requisito ADR 0108 §4 | Resultado verificado | Pendiente de verificar |
| --- | --- | --- |
| Funcionalidad, teclado y accesibilidad | PASS manual de Isaac para marco, Inicio/Roadmap, tema, Tab/Enter/Espacio y X en corte 1 | Studio/Launcher, lector, AltGr y Windows 10/11 |
| Fidelidad con Electron | FALLO visual inicial registrado en corte 1; arreglos en #2297 | Comparativa definitiva y OK de Isaac |
| RSS como máximo la mitad de Electron; arranque no más lento | PENDIENTE; no hay mediciones nuevas | Premedición Mac y prueba A en PC de juego |
| Coste por pantalla <=1,5 veces Electron | PENDIENTE | Registrar horas y aceptar equivalencia de las tres pantallas |
| Escalas 100/125/150 y 30 minutos sin bloqueos | PENDIENTE | Prueba física, sin deducirla de un proceso offscreen |

## Qué mide el guion

`scripts/corte2.py` prepara el plan por defecto. `execute` solo funciona en
macOS con `--mac-cleared`; no compila ni descarga nada. N=10 por cliente,
pantalla inicial y tipo de arranque: 120 procesos, uno a la vez, alrededor de
100 minutos. Alterna Rune/Electron en cada repetición; cada proceso frío va
seguido de uno caliente. No purga cachés del SO ni requiere sudo: «frío» es un
proceso con estado QA nuevo; «caliente» es repetir inmediatamente ese binario,
también con estado nuevo. No equivale a arrancar después de reiniciar el PC.

1440×900, oscuro, escala 100 %, datos de escena base exportados mediante la
función existente createMockHost de Electron, con su hash. Rune los reproduce
como respuestas/eventos tipados y solo acepta lecturas; ningún backend nuevo.
Así Studio mide cuatro widgets en ambos clientes (el corpus mínimo tiene uno)
y Launcher respeta también las variaciones de perfiles al empezar en Inicio; sin cuentas ni escritura
de producto. Cada proceso empieza en una de las tres pantallas y recorre el
ciclo Inicio → Studio → Launcher → Inicio, rotado para volver a su pantalla
inicial. Sin cambiar de proceso entre pantallas. Electron arranca en Inicio y
navega a la pantalla inicial elegida; Rune aplica su preset al crear el estado.
Esa diferencia de ruta queda incluida en el tiempo de arranque de Studio y
Launcher; no se disfraza de comparación de rutas de producción idénticas.

- Arranque: reloj monotónico del controlador, desde antes de crear el Hub hasta
  observar el marcador del primer frame con datos. En Rune se exige modelo y
  recursos decodificados, y se marca tras enviar el frame a la GPU; en Electron
  se exigen controles/datos, fuentes, imágenes y dos RAF. Es un **proxy offscreen**,
  no tiempo de presentación en pantalla ni garantía de finalización de la GPU.
  La recepción de stdout añade latencia del controlador a ambos clientes.
- Memoria: suma RSS de todo el árbol del Hub, incluidos renderer/GPU de Electron;
  incluye también helpers huérfanos identificados por la ruta del bundle QA
  propio; excluye Bun/controlador y el muestreador. Muestreo cada 250 ms aproximadamente.
  Espera 2 s desde el frame útil y mide 5 s; mediana de RSS del intervalo. Informa
  antes y después de recorrer las otras pantallas y volver a la inicial.
- CPU: diferencia de tiempo acumulado de todos los procesos durante ese intervalo
  de 5 s, dividida por su duración real. `ps time` en segundos, resolución de
  centésimas; 100 % = un núcleo. Se conservan PID y fecha de nacimiento. Cambios
  en el árbol, PID reutilizado o contadores ausentes invalidan la muestra.
- Cambio: desde despachar el clic sintético hasta el marcador de frame útil.
  La tabla muestra el regreso a la pantalla indicada. `phases` conserva las
  otras transiciones, RSS y CPU por pantalla de cada proceso.
- Tamaño sin comprimir: binario Rune y Electron.app + out-qa, contando archivos
  físicos una vez por árbol y sin seguir enlaces. Es huella **QA**, no tamaño de
  instalador, descarga ni distribución. Los builds tienen perfiles distintos:
  Rune debug por el cierre de sus herramientas de captura; Electron QA.

Rune usa `--frames --realtime --script --fps 60`, que renderiza continuamente
aunque la UI no cambie. Electron permanece oculto con backgroundThrottling=false.
Por tanto, la CPU y el rendimiento de este guion no certifican el reposo del
event loop nativo ni deciden el ADR. No se resta un supuesto coste del arnés.
La equivalencia exacta de datos/acabado y el ruido por usar el Mac a la vez se
revisan antes de interpretar resultados. No hay decisión automática de ganador.

## Preparación y ejecución

En Windows, solo preparar o recalcular la tabla: nunca `execute`, ni el binario.
La carpeta de plan y tabla pendiente ya se prepara en la ruta de evidencia:

```powershell
python hub-rune/scripts/corte2.py plan --n 10 --output D:/VantareServer/evidence/hub-rune/corte2
```

Se exige carpeta nueva, para no pisar evidencia anterior. Después de recuperar
el Mac y cerrar primero #2297, usar un checkout propio limpio de este PR con las
tres pantallas, un binario **debug** compilado con Rust 1.99.1, Rune d5338988 y
`--locked`, y Electron QA del **mismo SHA**. Construir por separado antes del lote;
no iniciar compiladores durante la medición. La preparación Electron, bundle
privado con LSUIElement=true y guardia anterior al entry son las de corte 1.
No modificar Electron instalado de Isaac ni sus preferencias de Automatización.
Las dependencias existentes Bun/Playwright de hub-web deben estar instaladas.

```sh
python3 vantare-v2/hub-rune/scripts/corte2.py execute --n 10 \
  --checkout /ruta/al/checkout-propio --sha SHA_COMPLETO_DE_ESTE_BUILD \
  --rune /ruta/al/target-propio/debug/vantare-hub-ui-rune \
  --output /ruta/propia/evidence/corte2/mac-AAAAMMDD --mac-cleared
```

El guion no tiene alternativa con ventana. Rune entra por la ruta headless de
su versión fijada; el probe exige argumentos de ese modo antes de try_run.
Electron reutiliza la guardia de corte 1: accessory, ventanas ocultas y no
enfocables, métodos show/focus anulados antes de cargar el entry. Verifica
visible/focusable/focused y el PID frontal por AppKit, sin System Events.
Si falla una condición, termina sus procesos y para el lote, sin reintentar ni
abrir otra modalidad. Reserva mínima 12 GiB libres; rechaza compiladores activos.
No borra targets, datos de Isaac ni archivos de otros workers.

## Evidencia y decisión

Copiar **la carpeta del lote completa** a una subcarpeta nueva de
`D:/VantareServer/evidence/hub-rune/corte2/`. El formato conserva `index.html`,
`manifest.json` y tabla Markdown como corte 1, además de `summary.csv/json`,
`plan.json`, logs y muestras por proceso. El manifest guarda SHA de código,
hash del binario, entry Electron, snapshots de datos y controladores, SO, núcleos y todas las
repeticiones. No se excluyen outliers ni se relanzan fallos automáticamente.
Una celda sin N repeticiones válidas queda PENDIENTE, sin ceros inventados.

```powershell
python hub-rune/scripts/corte2.py report --output D:/VantareServer/evidence/hub-rune/corte2/mac-AAAAMMDD
```

Conservar los logs aun si se detiene el lote. Retirar después solo targets
propios antiguos, verificando rutas y que ningún proceso los use; no automatizar
limpieza de otros proyectos. No se ha conectado al Mac ni ejecutado este lote.
Quedan pendientes su primera validación real, capturas y resultados.

El ADR exige después prueba A en PC de juego y 10 arranques fríos + 10 calientes,
sumando todos los procesos de cada Hub, mismo trabajo y builds comparables.
Rune requiere los cinco gates, RSS <=0,5× Electron, arranque no más lento y
coste <=1,5×. Empate o evidencia inconclusa: Electron. Este preflight Mac no
cierra por sí solo el corte 2 ni autoriza retirar Electron o publicar nada.
