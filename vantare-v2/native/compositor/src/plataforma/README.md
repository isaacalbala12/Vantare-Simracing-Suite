# Plataforma Windows · VANTA-140 / #2022

API: `Plataforma::nueva(modo, region_fisica, carpeta_fuentes)`, `aplicar(&Lote)`,
`ahora()`, `proximo_fotograma()`, `capturar(raiz, instante, ruta)`.
`Bucle::nuevo()` permite `avisador()` (clonable para el lector del pipe),
`vigilar(carpeta)` y `esperar(&plataforma, hay_transiciones_pintadas)`.
El dueño del lector debe cancelarlo y hacer join antes de destruir su bucle.
La plataforma no crea hilos. Sus objetos COM y ventanas pertenecen al hilo creador.

La región de entrada se expresa en píxeles físicos del monitor elegido. Las capas
se expresan en DIP. `PorOverlay` crea una ventana por raíz. Incluye la tinta del
subárbol y el recorrido completo de X/Y, escala y giro, incluidos extremos
interiores de las curvas. Añade 64 DIP de margen configurable mediante
`margen_animacion` antes de crear las capas. La envolvente puede ser conservadora
cuando varias propiedades se animan a la vez. Cada superficie cubre los dibujos,
medio ancho de borde y tres desviaciones de desenfoque más el desplazamiento de
las sombras; su offset compensa el origen de tinta sin cambiar `Colocar.rect`.
Todas las salidas comparten dispositivo DComp; `aplicar` hace exactamente un
`Commit`. Si falla una operación, se propaga el error sin Commit: destruir y
reconstruir la plataforma; no continuar sobre el lote parcialmente preparado.

`Ordenar` comprueba la lista completa de hermanas, incluidas las fantasmas, antes
de tocar los visuales. Conserva superficies y animaciones. Usa RemoveVisual y
AddVisual(TRUE, referencia): TRUE sin referencia coloca debajo de todas; con
referencia coloca por encima de ella. En raíces `PorOverlay` reordena las ventanas
con DeferWindowPos sin activarlas. Un id desconocido, una duplicación, un padre
distinto o una lista incompleta produce un error tipado.
Referencia: https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositionvisual-addvisual

`IDCompositionVisual3::SetOpacity` evita un grupo de efectos adicional. Se fija
el modo LAYER para aplicar la opacidad al subárbol como una unidad. Los transforms
2D se asignan mediante la interfaz base `IDCompositionVisual` (Visual3 oculta ese
método con la versión 3D en los bindings). La posición de maquetación tiene un
visual contenedor propio; X/Y animan el visual interior sin perder esa posición.

Los coeficientes de `Tramo` se interpretan literalmente como dice `capas.rs`:
polinomio en segundos desde `Curva.inicio`. Antes de AddCubic se desplaza su origen
al comienzo de cada segmento nativo. La animación se rebasa a
`nextEstimatedFrameTime / timeFrequency`; no se usa el reloj de pared.
`repetir=(desde,duracion)` sigue AddRepeat: repite el intervalo inmediatamente
anterior a `desde`. Para un commit tardío se graba un ciclo rotado completo y se
repite ese ciclo, conservando la fase. `fin` sigue siendo un final absoluto relativo
a la curva, incluso cuando hay repetición.
Referencia: https://learn.microsoft.com/en-us/windows/win32/api/dcompanimation/nf-dcompanimation-idcompositionanimation-addrepeat

Texto: colección privada DirectWrite con TTF estáticos, ruta configurable mediante
`VANTARE_COMPOSITOR_FUENTES` o `--fuentes`. No se instalan ni copian fuentes.
Se cargan todos los .ttf. El alias `Inter` se resuelve a la familia estática exacta
`Inter W400`…`Inter W800` (incluidos 650 y 750); `Rajdhani` corresponde a
`Rajdhani SemiBold` 600 y `Space Mono` a 400. Se pide a DirectWrite el peso real de
la cara elegida para evitar síntesis. Una familia o peso ausente produce
`FuenteNoDisponible` al aplicar el lote, sin sustitución por otra fuente.
Se usa `CreateRenderingParams` como `gpui_windows/src/directx_renderer.rs`,
antialiasing gris, espaciado mediante TextLayout1, `tnum`, interlínea uniforme,
alineación y ajuste por caracteres con «…». La interletra incluye el espacio tras
el último carácter, como `efficiency/text.rs`. Body usa Inter; la línea base usa
ascenso 1984/2048 y descenso 494/2048 redondeados y centra con floor, como GPUI.
El ajuste Display de +1 DIP en `vantare/paint.rs` pertenece al productor del dibujo
(caja.y), porque el contrato Fuente no lleva un estilo Body/Display/Mono.
El Rajdhani del paquete no contiene la característica OpenType tnum: sus cifras
siguen siendo proporcionales al pedirla, igual que con esa misma cara en GPUI.
Diferencia pendiente de comparación visual: GPUI obtiene cobertura ClearType,
promedia RGB y aplica su shader `alpha_correction.hlsl`; Direct2D aplica su propio
rasterizador gris con los parámetros del sistema. No se afirma igualdad de píxeles.
`Medidor` no tiene Result: ante un fallo devuelve NaN con diagnóstico; quien pueda
propagar errores debe usar `Texto::medir_resultado`.

Captura: contexto D2D fuera de pantalla, curvas evaluadas en el instante indicado,
composición por capas y lectura CPU; WIC escribe PNG con bytes RGBA premultiplicados.
WIC recibe BGRA de 32 bits, su formato admitido por el encoder PNG, y escribe los
canales en el orden PNG sin deshacer la premultiplicación (PNG no lleva una marca
de alfa premultiplicado). No es una captura del escritorio ni de
Windows.Graphics.Capture.

Fluidez: `Medicion::fotograma` toma `lastFrameTime` de GetFrameStatistics y omite
muestras repetidas; el periodo procede de currentCompositionRate. Cuenta intervalos
superiores a 1,5 periodos. Es muestreo del compositor, no prueba de presentación del
simulador ni de VRR/G-Sync. El trabajo por lote se recoge solo después de
`iniciar_medicion`. Referencia:
https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositiondevice-getframestatistics

`reloj_estado` registra el código nativo (0 = éxito, 0xc01e0006 = pantalla ocluida);
`periodo_esperado_ms` conserva el periodo usado para contar intervalos perdidos.
La ruta ocluida usa DwmFlush y una espera de mensajes de 16 ms para no girar en vacío.
En ese estado las estadísticas no prueban la cadencia de una pantalla activa.

El reloj Windows 11 se resuelve dinámicamente con GetProcAddress. Como la cola
Win32 no es un HANDLE, durante transiciones se atienden mensajes entre esperas de
reloj con límite de 16 ms. Windows 10 usa DwmFlush. En reposo se espera de forma
indefinida en MsgWaitForMultipleObjectsEx. No hay temporizador periódico en reposo.

Features añadidas de windows 0.62.2: Win32_System_Com_StructuredStorage (WIC),
Win32_System_Threading y Win32_Security (evento del lector), Win32_Storage_FileSystem
(vigilancia de carpetas). No hay dependencias nuevas.

La espera del reloj se hace sin pasar los eventos del modelo al API: el éxito de
la variante sin handles es cero, no una notificación de modelo. Los mensajes, el
modelo y los ficheros se consumen mediante MsgWait y un sondeo no bloqueante de
handles antes de devolver el fotograma. Su latencia
máxima adicional durante una transición es el límite de 16 ms del reloj.
