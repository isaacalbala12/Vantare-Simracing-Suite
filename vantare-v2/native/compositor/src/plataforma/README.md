# Plataforma Windows · VANTA-140 / #2022

`Plataforma::nueva(modo, region_fisica, carpeta_fuentes)` crea un solo dispositivo
DComp respaldado por D2D/D3D11. Monitor crea una ventana; PorOverlay una por raíz.
Todas comparten un único Commit por lote. La región está en píxeles físicos y
las capas en DIP. La plataforma conserva el contexto PMv2 del hilo hasta Drop.

`aplicar` valida el lote completo en un borrador (ids, padres, órdenes, fuentes,
pesos, rects, pinturas y curvas) antes de cambiar el árbol o los visuales. Un
error de validación permite corregir y reintentar. Un fallo durante la aplicación
nativa invalida la instancia: el siguiente lote devuelve PlataformaInvalida.
Tras Commit se consulta CheckDeviceState mediante la interfaz v1 del mismo
objeto. D2DERR_RECREATE_TARGET y DXGI_ERROR_DEVICE_REMOVED/RESET se traducen a
DispositivoPerdido. Reconstruir el árbol y el dispositivo queda fuera de esta prueba.

Cada Animar crea una animación con SetAbsoluteBeginTime(inicio en ticks QPC).
Solo se programan operaciones Animar del lote actual; las anteriores siguen
corriendo. Las curvas finitas terminadas se retiran del mapa al aplicar otro lote.
El contrato repetir=(desde,duración) repite [desde,desde+duración) para siempre:
AddRepeat(desde+duración,duración), sin End. Las finitas sí tienen End.
https://learn.microsoft.com/en-us/windows/win32/api/dcompanimation/nf-dcompanimation-idcompositionanimation-setabsolutebegintime
https://learn.microsoft.com/en-us/windows/win32/api/dcompanimation/nf-dcompanimation-idcompositionanimation-addrepeat

Pintar reutiliza IDCompositionSurface mientras su tamaño físico no cambia.
La superficie incluye toda la tinta con origen ajustado a píxel físico entero;
se compensa el offset del contenido y se conserva Colocar.rect. PorOverlay cubre
la tinta del subárbol y los extremos de todas sus animaciones, más margen extra.
El borde se pinta dentro de la caja. El desenfoque de GPUI en shaders.hlsl es σ
sin conversión adicional; se usa GaussianBlur con ese valor y margen de 3σ.
La integral aproximada de GPUI y el efecto D2D no garantizan igualdad de sombra.

Ordenar incluye fantasmas y valida todas las hermanas. RemoveVisual y
AddVisual(TRUE,referencia) conservan superficies y animaciones. Sin referencia,
TRUE coloca debajo de todas. Las raíces PorOverlay se ordenan con DeferWindowPos.
La captura verifica el orden del árbol, no el orden visual efectivamente presentado
por DComp. La captura vuelve a rasterizar en D2D; escalar/girar un bitmap ya
pintado en DComp puede dar píxeles distintos.

Texto carga todos los TTF de ui/assets/fonts en una colección privada; Inter se
resuelve a la familia estática exacta, Rajdhani a SemiBold 600 y Space Mono a 400.
No hay sustitución de familia/peso. IDWriteTextRenderer extrae los runs modelados;
IDWriteGlyphRunAnalysis usa el modo recomendado (OUTLINE→NATURAL_SYMMETRIC),
cobertura ClearType 3×1 promediada por entero a gris y cuantización x de 1/4 píxel,
y a píxel entero. Aplica el contraste 1.5 y gamma_ratios de shaders.hlsl sobre
el brillo del color, antes de crear el bitmap BGRA premultiplicado. La línea base,
interletra, tnum y elipsis siguen efficiency/text.rs. No se recortan ascendentes
al rectángulo de línea. Rajdhani no contiene tnum: sus cifras son proporcionales.
`medir_resultado` devuelve errores tipados; el Medidor de tupla heredado devuelve
una medida vacía finita y conserva el error para tomar_error_medicion o
el siguiente aplicar, sin NaN ni mensajes repetidos por medida.

El DPI se toma de la salida raíz de cada capa. WM_DPICHANGED aplica el rectángulo
sugerido y el bucle devuelve PantallasCambiadas; el llamador llama actualizar_dpi
para repintar las superficies a la nueva densidad. No hay hilos de plataforma.
El lector del pipe conserva Avisador; su dueño debe cancelarlo y unirlo al cerrar.
La espera del reloj recibe el evento manual del modelo y las vigilancias; se
comprueban los handles antes de devolver Fotograma. Mensajes Win32 se intercalan
con esperas del reloj acotadas a 16 ms. Estados desconocidos activan DwmFlush con
aviso único; una pantalla ocluida espera mensajes 16 ms para evitar girar en vacío.

Medicion registra contadores DWM entre los extremos de cada transición. Se mide primero un reposo sin
animaciones de dos segundos y después cada transición. Si el número de refrescos no corresponde al 75–125 % de la frecuencia esperada, o DComp
indica pantalla ocluida, el JSON lleva valida=false y fotogramas=null: no publica
percentiles de fluidez como válidos. Además exige confirmación física explícita
(--monitor-confirmado si, solo tras comprobarlo). Sin ella el motivo es «No válidos
hasta confirmar monitor físico encendido», aunque DWM componga mientras animamos. Cada lote registra operaciones, duración,
repintados y superficies nuevas. Los contadores son de DWM, no del simulador ni
prueba de VRR/G-Sync. --texto-referencia genera las dos líneas de comparación;
--repintar-hz activa actualizaciones periódicas de texto para medir reutilización.

Dependencia autorizada: windows-core =0.62.2 (MIT OR Apache-2.0), ya transitiva de
windows 0.62.2; declaración directa exigida por #[implement] para IDWriteTextRenderer.
Las features Windows añadidas son Com_StructuredStorage (WIC), Threading/Security
(evento) y Storage_FileSystem (vigilancia). PNG guarda RGB premultiplicado, como
convención de esta prueba; no es Windows.Graphics.Capture.

La cuantización usa round_half_toward_zero de la revisión GPUI 72d28c3, no floor.
