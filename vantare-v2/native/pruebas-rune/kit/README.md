# VANTA-141: campaña, recogida y análisis

Los controladores de campaña, Inicio, corrección visual, aguante y recogida
están implementados e integrados con el muestreador. La entrega requiere además
el inventario de binarios, cierre de DLL y ZIP verificado. Los tests sintéticos
comprueban el análisis; no son mediciones del PC de juego.

El plan RONDAS.ps1 genera ABBA/BAAB y controles A/A, con registro exclusivo
de un máximo de tres intentos. Una ventana por monitor contiene 1, 4 o 10
Relative; el escenario principal es una ventana con diez widgets a 60 Hz.
Se conservan la demanda real de 33 ms y todas las publicaciones de origen.
La pérdida compara únicamente envíos efectivos del pipe con recibidos.
Durante las rondas la interfaz es el único suscriptor: no lanzar el contador
adicional contra el mismo núcleo, pues duplicaría los envíos observados.
El contador se reserva a la comprobación no gráfica separada del replay.

PROCESOS.ps1 importa funciones sin iniciar procesos y rechaza el servidor
antes de cualquier lanzamiento. Publica la identidad de raíz atómicamente,
conserva logs y elimina variables VANTARE heredadas al crear hijos propios.
No lee ni publica sus valores. El kit asignará rutas QA y pipes privados.

RECOGER.ps1 necesita la carpeta concreta con campana.json y sin EN-CURSO.lock.
Conserva fallos y verifica los hashes de cada entrada. Nunca sobrescribe un zip.

package.ps1 se usa solo en el servidor con Python >=3.11 y dumpbin. Recibe
un manifiesto schema=1: files con source absoluto en D:, path relativo del
kit y sha256; binaries con las diez funciones requeridas, path, source_sha
y perfil. Cada variante relative exige Release opt-level=3, lto=false,
codegen-units=16, debug=false. Exige grabación, PresentMon 2.6.0 oficial y los
guiones raíz completos. Comprueba el SHA incrustado en cada binario, todas
las dependencias de exe/DLL y el contenido/hash del zip sin ejecutar nada.
INICIAR incluye bin/ en PATH para los CRT comunes; Electron conserva
su árbol completo. Un staging fallido se conserva y no es una entrega válida.

ANALIZAR.ps1 aplica INFORME-FABLE §8 a evidencia normalizada. Por decisión de
Isaac, compilation.status=pending_authorized con plan explícito omite las
medidas limpias/incrementales de máquinas distintas: no las inventa ni las
cuenta como PASS. Un cumplimiento de ejecución queda marcado como compilación
pendiente. Un crash observado incluso en aguante incompleto, o una regresión
no exceptuable, prevalece sobre comprobaciones manuales pendientes.
Solo la excepción Rune de memoria <15% puede pedir discusión, con todo lo demás
verificado. Ningún veredicto adopta ni publica una tecnología automáticamente.

Verificación: 25 tests Python de umbrales, cruces y paquete PASS; planificador
en seco y recogida sintética PASS. Guard del servidor PASS sin lanzar hijos.
No se ha ejecutado una interfaz, PresentMon, adaptador ni captura en servidor.

## Campaña y normalización de evidencia cruda

INICIAR prepara/retoma B (8–24 rondas), con una ventana y 1/4/10 widgets.
Principal: diez widgets, 60 Hz, con/sin carga; Completa añade toda la matriz.
Cada observación usa un núcleo privado de calentamiento y otro de 60 s;
se exige >=10 s de publicaciones de calentamiento. Se conservan las 3840
publicaciones de origen y se comparan SOLO envíos reales/recepciones a 33 ms.
El muestreador/PresentMon arranca antes de la interfaz. La carga se calibra
una vez sin overlays y se reutiliza su número de iteraciones en todos.
Ruido >2%, CPU/GPU térmica, pérdidas o A/A >=2,5% anulan la familia completa.
Hasta tres intentos, conservados; reanudar usa el primero completo, no el mejor.
Un mutex impide campañas/aguantes/recogidas simultáneos en la misma sesión.

INICIO registra 10 perfiles QA nuevos y 10 reutilizados por motor y cinco
interacciones ABC/CAB/BCA. No purga cachés del sistema; primer arranque tras
reinicio queda aparte. No hay núcleos live ni cuentas: Electron mock, GPUI demo
y Rune estático. Ruta QA nueva y pipe privado. En Rune, el primer dibujo puede
ser CPU antes de un Present: T1 usa marca posterior a GdiFlush/DwmFlush;
se conserva también el primer tiempo observado por PresentMon. Las marcas
observadas por el padre son cotas superiores. Compilación de esa marca Rune
pendiente de Mac; no empaquetar el binario anterior con el contrato nuevo.

CORRECCION guía las ocho comprobaciones y guarda capturas PNG recientes;
S/N/P son observaciones del operador, nunca aprobaciones automáticas.
AGUANTE y RECUPERAR_AGUANTE vienen de la pieza 10/PR #2261. RECOGER rechaza
locks dentro de aguantes activos además del lock de campaña y comprueba CRC/SHA.

ANALIZAR -Carpeta vuelve a calcular térmica desde CSV y normaliza IPC/QPC,
familia, CPU/GPU, latencia y carga antes de aplicar §8. Solo stdlib Python,
sin hardware. En el kit, analisis/ reúne las fuentes canónicas: latencia.py
(pieza 3), agregar.py (7), resumir_aguante.py (10) y estos normalizadores.
No se duplican en el producto. -Resumen conserva el modo para datos normalizados.
La temperatura CPU queda no disponible y el informe explica sus señales proxy.

Verificación actual: 30 pruebas Python, plan/recogida/IPC/ruido/A-A/mutex en seco,
sintaxis y parámetros de 35 guiones PASS. Se corrigió el uso inválido de
Set-Content -NoClobber: Out-File mantiene creación sin sobrescritura y UTF-8.
Identidad JSON y rechazo de sobrescritura PASS con datos, sin proceso real.
VALIDAR_VENTANAS pasó por cola: solo Roslyn y Marshal.SizeOf, sin Win32.
No se ejecutó ninguna interfaz ni PresentMon en servidor. El ZIP final aún no existe.

13/11, verificación final de auxiliares: VENTANAS.cs compilado por cola con
Roslyn /optimize+ /debug-; RECT=16 y MONITORINFOEXW=104 PASS, sin APIs nativas.
Pruebas positivas de identidad JSON (proceso PowerShell actual, sin lanzar
ninguno) y rechazo de recogida con aguante activo anidado PASS. No se confunde
un ciclo de presentación con el coste CPU/GPU: el informe declara expresamente
MsBetweenPresents como intervalo, incluida la cadencia de demanda del producto.
