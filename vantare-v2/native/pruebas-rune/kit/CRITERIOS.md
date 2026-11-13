# Criterios de validez y ruido — revisión de #2286

La calibración se hace antes de las rondas. Si falta sensor GPU, su LUID propio
o TemperatureWarning del driver, se detiene allí con un mensaje; no se gastan
horas en una campaña que el analizador no podría verificar.

CPU: los mínimos de rendimiento/limitación se fijan desde el percentil 10 de
la calibración menos 2 puntos, acotados entre 95 y 98 % del nominal. Solo se
invalida si más del 10 % de las muestras de la ronda incumple esos mínimos o
tiene flags de limitación. Un pico de un segundo no basta. No se inventa
temperatura CPU: continúa no disponible. Estas señales también pueden indicar
política/energía; no prueban por sí solas una causa térmica.

GPU: se mantiene el aviso térmico real del driver. La tolerancia de deriva de
inicio entre rondas es dos veces el rango de los diez últimos puntos de la
calibración, acotada entre 5 y 8 °C. Se compara la mediana de los cinco primeros
puntos con la primera observación térmicamente válida de esa condición
(Hz, carga y número de widgets); se conserva su referencia y su origen.
El servidor vuelve a calcular desde los CSV con la misma política congelada.

Ruido ajeno: más del 2 % CPU de toda la máquina, por PID y como media de las
muestras de la ronda; no por el peor segundo. Ausencia real de ese proceso
contribuye cero a la media; faltas de identidad/contador no se convierten en cero.
La CPU de dwm.exe NO se suma a la familia medida; no se atribuye ese coste
del compositor a los ciclos CPU del overlay. Se conserva el control de ruido.

Todas las métricas disponibles tienen A/A detrendido y tolerancia: el mayor
de 2,5 % del baseline y un mínimo absoluto (0,5 MiB de privada/VRAM; 0,1 puntos
GPU; 0,1 ms de p99/latencia/carga; un frame descartado; 10 ms de visibilidad;
50 ms de compilación). CPU solo tiene el margen relativo. El informe conserva
umbral nominal, tolerancia y si se superó el nominal. Fast tampoco se compara
con <= exacto: diferencias dentro de precisión no son regresiones concluyentes.
La confianza CPU del 95 % sigue contrastándose con el umbral nominal; no se
declara cumplida una mejora del 10 % solo por el margen.

Outliers: no se elimina ni winsoriza ningún extremo numérico. Se conservan
todas las muestras válidas, medianas y bloques detrendidos. Solo las reglas
previas de integridad/entorno invalidan una captura. Un A/A fallido solicita
repetir la pareja de bloques A/A+A/B de esa ronda, con y sin carga; no rechaza
la variante ni vuelve a ejecutar toda la campaña. Se conserva todo y se usa
la primera reparación cuyo A/A de todas las métricas sea válido, nunca el
mejor resultado A/B. Máximo original + dos repeticiones. Un crash o un fallo
físico ya observado nunca queda oculto por una solicitud de repetición.

El servidor emite retry_request en el JSON del veredicto. En el PC:

```powershell
.\REPETIR_BLOQUES.ps1 -Campana 'D:\PruebaRune\campana' -Informe 'D:\PruebaRune\veredicto.json'
```

Después se recoge de nuevo TODO y se analiza en el servidor. No hace falta
Python en el PC. El guion exige el mismo kit y solo acepta las rondas pedidas.

Aguante: M es declarativo (confirmación del usuario), no prueba automática de
suspensión. R combina confirmación declarativa con cambio de píxeles realmente
observado y restauración por Windows. Mantener la resolución distinta al menos
tres segundos. Apagar/desconectar un monitor o cambiar solo Hz no sirve como
prueba de resolución. Una R prematura avisa y permite continuar el aguante.

El ZIP no incluye COPIAR_MAC.py ni compilar_mac.py. Tampoco reutiliza los tres
binarios Rune anteriores con audio/MPL: faltan hasta reconstruirlos en el Mac
con las mismas features permisivas del Hub Rune. No ejecutar un ZIP pendiente.
