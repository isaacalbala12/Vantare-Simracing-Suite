# Criterios de validez y ruido â€” revisiÃ³n de #2286

La calibraciÃ³n se hace antes de las rondas. Si falta sensor GPU, su LUID propio
o TemperatureWarning del driver, se detiene allÃ­ con un mensaje; no se gastan
horas en una campaÃ±a que el analizador no podrÃ­a verificar.

CPU: los mÃ­nimos de rendimiento/limitaciÃ³n se fijan desde el percentil 10 de
la calibraciÃ³n menos 2 puntos, acotados entre 95 y 98 % del nominal. Solo se
invalida si mÃ¡s del 10 % de las muestras de la ronda incumple esos mÃ­nimos o
tiene flags de limitaciÃ³n. Un pico de un segundo no basta. No se inventa
temperatura CPU: continÃºa no disponible. Estas seÃ±ales tambiÃ©n pueden indicar
polÃ­tica/energÃ­a; no prueban por sÃ­ solas una causa tÃ©rmica.

GPU: se mantiene el aviso tÃ©rmico real del driver. La tolerancia de deriva de
inicio entre rondas es dos veces el rango de los diez Ãºltimos puntos de la
calibraciÃ³n, acotada entre 5 y 8 Â°C. Se compara la mediana de los cinco primeros
puntos con la primera observaciÃ³n tÃ©rmicamente vÃ¡lida de esa condiciÃ³n
(Hz, carga y nÃºmero de widgets); se conserva su referencia y su origen.
El servidor vuelve a calcular desde los CSV con la misma polÃ­tica congelada.

Ruido ajeno: mÃ¡s del 2 % CPU de toda la mÃ¡quina, por PID y como media de las
muestras de la ronda; no por el peor segundo. Ausencia real de ese proceso
contribuye cero a la media; faltas de identidad/contador no se convierten en cero.
La CPU de dwm.exe NO se suma a la familia medida; no se atribuye ese coste
del compositor a los ciclos CPU del overlay. Se conserva el control de ruido.

Todas las mÃ©tricas disponibles tienen A/A detrendido y tolerancia: el mayor
de 2,5 % del baseline y un mÃ­nimo absoluto (0,5 MiB de privada/VRAM; 0,1 puntos
GPU; 0,1 ms de p99/latencia/carga; un frame descartado; 10 ms de visibilidad;
50 ms de compilaciÃ³n). CPU solo tiene el margen relativo. El informe conserva
umbral nominal, tolerancia y si se superÃ³ el nominal. Fast tampoco se compara
con <= exacto: diferencias dentro de precisiÃ³n no son regresiones concluyentes.
La confianza CPU del 95 % sigue contrastÃ¡ndose con el umbral nominal; no se
declara cumplida una mejora del 10 % solo por el margen.

Outliers: no se elimina ni winsoriza ningÃºn extremo numÃ©rico. Se conservan
todas las muestras vÃ¡lidas, medianas y bloques detrendidos. Solo las reglas
previas de integridad/entorno invalidan una captura. Un A/A fallido solicita
repetir la pareja de bloques A/A+A/B de esa ronda, con y sin carga; no rechaza
la variante ni vuelve a ejecutar toda la campaÃ±a. Se conserva todo y se usa
la primera reparaciÃ³n cuyo A/A de todas las mÃ©tricas sea vÃ¡lido, nunca el
mejor resultado A/B. MÃ¡ximo original + dos repeticiones. Un crash o un fallo
fÃ­sico ya observado nunca queda oculto por una solicitud de repeticiÃ³n.

El servidor emite retry_request en el JSON del veredicto. En el PC:

```powershell
.\REPETIR_BLOQUES.ps1 -Campana 'D:\PruebaRune\campana' -Informe 'D:\PruebaRune\veredicto.json'
```

DespuÃ©s se recoge de nuevo TODO y se analiza en el servidor. No hace falta
Python en el PC. El guion exige el mismo kit y solo acepta las rondas pedidas.

Aguante: M es declarativo (confirmaciÃ³n del usuario), no prueba automÃ¡tica de
suspensiÃ³n. R combina confirmaciÃ³n declarativa con cambio de pÃ­xeles realmente
observado y restauraciÃ³n por Windows. Mantener la resoluciÃ³n distinta al menos
tres segundos. Apagar/desconectar un monitor o cambiar solo Hz no sirve como
prueba de resoluciÃ³n. Una R prematura avisa y permite continuar el aguante.

El ZIP no incluye COPIAR_MAC.py ni compilar_mac.py. Tampoco reutiliza los dos
binarios Rune anteriores con audio/MPL: faltan hasta reconstruirlos en el Mac
con las mismas features permisivas de Overlays Rune. No ejecutar un ZIP pendiente.

Tras el original y dos repeticiones iniciadas por bloque, un A/A que siga
fallando termina como Â«inconcluso: A/A agotadoÂ». No se genera otra solicitud.
El presupuesto se conserva aunque una repeticiÃ³n falle o se interrumpa.
