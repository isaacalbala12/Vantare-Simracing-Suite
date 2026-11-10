# Plataforma Windows · VANTA-140 / #2022

API: `Plataforma::nueva(modo, region_fisica, carpeta_fuentes)`, `aplicar(&Lote)`,
`ahora()`, `proximo_fotograma()`, `capturar(raiz, instante, ruta)`.
`Bucle::nuevo()` permite `avisador()` (clonable para el lector del pipe),
`vigilar(carpeta)` y `esperar(&plataforma, hay_transiciones_pintadas)`.
El dueño del lector debe cancelarlo y hacer join antes de destruir su bucle.
La plataforma no crea hilos. Sus objetos COM y ventanas pertenecen al hilo creador.

La región de entrada se expresa en píxeles físicos del monitor elegido. Las capas
se expresan en DIP. `PorOverlay` crea una ventana por raíz, con margen inicial de
64 DIP configurable mediante `margen_animacion` antes de crear las capas. El
llamador debe elegir un margen que incluya toda la trayectoria de sus animaciones.
Todas las salidas comparten dispositivo DComp; `aplicar` hace exactamente un
`Commit`. Si falla una operación, se propaga el error sin Commit: destruir y
reconstruir la plataforma; no continuar sobre el lote parcialmente preparado.

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
Se usa `CreateRenderingParams` como `gpui_windows/src/directx_renderer.rs`,
antialiasing gris, espaciado mediante TextLayout1, `tnum`, interlínea uniforme,
alineación y elipsis DirectWrite. La línea base se centra según la métrica natural.
Diferencia pendiente de comparación visual: GPUI obtiene cobertura ClearType,
promedia RGB y aplica su shader `alpha_correction.hlsl`; Direct2D aplica su propio
rasterizador gris con los parámetros del sistema. No se afirma igualdad de píxeles.
`Medidor` no tiene Result: ante un fallo devuelve NaN con diagnóstico; quien pueda
propagar errores debe usar `Texto::medir_resultado`.

Captura: contexto D2D fuera de pantalla, curvas evaluadas en el instante indicado,
composición por capas y lectura CPU; WIC escribe PNG con bytes RGBA premultiplicados.
Se declara formato RGBA al encoder para conservar esos bytes (PNG por sí mismo no
lleva una marca de alfa premultiplicado). No es una captura del escritorio ni de
Windows.Graphics.Capture.

Fluidez: `Medicion::fotograma` toma `lastFrameTime` de GetFrameStatistics y omite
muestras repetidas; el periodo procede de currentCompositionRate. Cuenta intervalos
superiores a 1,5 periodos. Es muestreo del compositor, no prueba de presentación del
simulador ni de VRR/G-Sync. El trabajo por lote se recoge solo después de
`iniciar_medicion`. Referencia:
https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositiondevice-getframestatistics

El reloj Windows 11 se resuelve dinámicamente con GetProcAddress. Como la cola
Win32 no es un HANDLE, durante transiciones se atienden mensajes entre esperas de
reloj con límite de 16 ms. Windows 10 usa DwmFlush. En reposo se espera de forma
indefinida en MsgWaitForMultipleObjectsEx. No hay temporizador periódico en reposo.

Features añadidas de windows 0.62.2: Win32_System_Com_StructuredStorage (WIC),
Win32_System_Threading y Win32_Security (evento del lector), Win32_Storage_FileSystem
(vigilancia de carpetas). No hay dependencias nuevas.
