# VANTA-141: Inicio Electron en modo de medición

Esta pieza construye el Hub actual de nightly, sin cambiar sus pantallas.
La opción de construcción VANTARE_HUB_MEASUREMENT_HOME=1 exige también
VANTARE_HUB_QA_BUILD=1. Solo ese paquete inicia directamente en Inicio,
con mock visual-dark:inicio-base y fecha de presentación fija del fixture.
La fecha del sistema y los temporizadores conservan su funcionamiento.
Los paquetes normales siguen iniciando en Ajustes.

En el PC, el ejecutable de esta variante exige `--medicion-inicio --control-stdin`.
El cierre de su entrada estándar termina la aplicación. No conecta cuentas ni
servicios reales. La procedencia está en el código empaquetado y en el recurso
FileDescription del ejecutable Windows: SHA, perfil, Electron, mock e Inicio.
Se mantienen sandbox, CSP y fuses del empaquetado habitual.

La compilación pasa por la cola, con la ruta absoluta a EMPAQUETAR_HUB.ps1
y una carpeta de artefactos nueva. El script comprueba captura.lock, espacio,
worktree limpio y salidas locales sin enlaces. Nunca inicia Electron.
Se ha leído electron-vite 6: build usa Vite y solo lanzaría Electron para
bytecode, opción ausente aquí; dev y preview quedan fuera del procedimiento.

Verificación: tipos de renderer/main y scripts, Biome, y las 116 pruebas
concentradas en reloj, navegación inicial, Ajustes y galería pasan en serie.
La suite completa con dos workers tuvo cuatro fallos de espera de Ajustes
y un timeout de importación de galería; se conservan sus informes. Se está
comprobando toda la suite con un worker, sin cambiar tests ni sus plazos.
Arranque, pantalla, interacción y medidas físicas quedan pendientes del PC.
Los tiempos limpios/incrementales comparables quedan pendientes por decisión
de Isaac: se medirán después en el servidor sin otros workers.
