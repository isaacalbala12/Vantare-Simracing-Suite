# VANTA-141: campaña, recogida y análisis

Este directorio todavía no es el kit final: faltan INICIAR.ps1, integración
del muestreador y AGUANTE.ps1. No presentar sus datos sintéticos como mediciones.

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
INICIAR deberá incluir bin/ en PATH para los CRT comunes; Electron conserva
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
