# ISA-1328 · Aviso de vuelta rápida

Petición y diseño aprobados por Isaac: convertir el aviso morado del boceto de marketing en un widget real. Seguimiento: https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218762634127535. Puente CI: GitHub #1328. Base: nightly e6d7d2b5.

## Diseño y alcance

Widget independiente `fastest-lap`, sistema Efficiency, banner horizontal con cronómetro morado, piloto, tiempo protagonista, fondo carbón y franjas rojas. Se coloca y redimensiona con los controles existentes de Studio. Sin dependencias nuevas ni cambios de arquitectura. Un renderer compartido conserva el diseño en Studio, Desktop, OBS y Workshop.

Alcance actualizado por Isaac el 23/09/2026: avisos de mejor vuelta personal y de clase activados por defecto, sin opción de sesión completa. Si una vuelta consigue ambos récords se muestra un único aviso de clase. Se mantienen seis segundos de duración y nombre del piloto opcional. Las preferencias se validan y guardan como contenido del widget. El idioma procede del contexto común es/en/pt/it.

La fuente es la clasificación Overlay V2 existente. Solo tiempos finitos positivos y frescos son candidatos; se comparan a precisión de milisegundos. La primera muestra establece la referencia y no dispara un aviso histórico. Solo una mejora estricta posterior genera un aviso. No se confunden empates, cambios de piloto o filas que desaparecen con nuevas vueltas rápidas. Sesión/epoch, fuente no live, cambio de alcance o reinicio descartan la presentación y establecen una nueva referencia. Snapshots repetidos o fuera de orden no reactivan avisos. Una nueva mejora sustituye al aviso anterior y reinicia su duración. Caduca aunque no lleguen más frames. Sin sonido ni cambios en la telemetría de origen.

Alternativas consideradas: un distintivo permanente repetiría la función del Standings; incorporar el aviso a Racing Flags mezclaría una notificación deportiva con una señal de seguridad. Se elige widget independiente para permitir posición y visibilidad propias.

## Ejecución

- [x] Leer contratos, base y arquitectura; localizar datos y diseño aprobado.
- [x] Registrar Asana y puente CI; preparar rama y worktree aislados.
- [x] Añadir tipo, definición, detector probado y presentación temporal local.
- [x] Registrar en Studio, persistencia, permisos y transporte con los contratos existentes.
- [x] Implementar el renderer y catálogos de idioma; añadir escenario reproducible de Workshop.
- [x] Verificar casos reales del contrato, interacción, expiración, build/typecheck y lint.
- [x] Registrar evidencia, handoff, roadmap y PR draft; sin promoción implícita.

Archivos previstos: nuevo directorio widget-types/fastest-lap y renderer Efficiency; registros/tipos/manifest/catálogo/política/config/transporte existentes; catálogos es/en/pt/it; fixture Workshop; pruebas focales y documentos de entrega.
La prueba física con LMU/Windows se declarará pendiente si no hay una sesión real disponible.


## Evidencia inicial del candidato (22/09/2026)

Frontend: 470 archivos y 3814 pruebas PASS, 2 omitidas; después del ajuste del escenario, 44 pruebas focales de Workshop PASS. Build/TypeScript y lint PASS. Go: perfiles/config y política de rendimiento con `-race` PASS; guardas de permisos y pruebas del nuevo widget con `-race` PASS; `go vet` de los paquetes modificados PASS. Quality PASS, NEW=0, MOVED=0, sin cambios de reglas o baselines.

La suite Go global se ejecutó con timeout de 60 s por paquete y falla en áreas ajenas al cambio: símbolos Windows en cmd/vantare, launcher, ruta Windows y Diagnostics/SQLite. No se presenta como verde. Revisión manual de navegador: primer frame sin aviso, nueva marca visible, caducidad sin nueva telemetría, volver atrás y repetir; composición legible en 480×104 y preview reducido a 280×72.

Pendientes de aceptación: revisión independiente y prueba física LMU/Windows/OBS. La ruta local `/workshop?widget=fastest-lap&system=vantare-functional&surface=studio&scene=fastest-lap-alert` muestra el componente real con datos de demostración. En Desktop/OBS, avanzar del primer al segundo paso activa el aviso.

Entrega: [PR draft #1330](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1330), implementación `dbc35180`, publicada en la rama aislada. Sin promoción.


## Ajustes aprobados el 23/09/2026

- Tamaño real editable en ancho y alto, controles visibles en Workshop y composición fluida por el viewport compartido. No estirar un bitmap ni duplicar el diseño.
- Mostrar mejor personal (sesión actual, desde la clasificación V2) y mejor de clase. Dos controles de activación; los perfiles de la primera propuesta se normalizan a ambos avisos. Nunca anunciar una marca de otra clase.
- Mantener una referencia personal y otra de clase; si coinciden gana clase. Nueva mejora reinicia la entrada; salida animada dentro del plazo de 6 s, un solo temporizador en cada momento y limpieza al desmontar/reconectar.
- Workshop permite ver el diseño estático y reproducir el ciclo real también en Studio. Al terminar la reproducción no se fuerza un banner persistente; botón explícito para volver al diseño.
- Verificar personal sin récord de clase, prioridad doble, rival de clase, otra clase, tamaños sin distorsión, entrada repetida, salida y reproducción de Studio; después frontend completo, build/lint y ratchet, actualizar misma PR y Asana. Sin merge.


## Verificación de los ajustes (23/09/2026)

Implementados tamaño real fluido, controles Ancho/Alto visibles en Workshop, avisos personales y de clase por separado (ambos activos por defecto) y prioridad única de clase. No queda selector de sesión completa. Cada aviso remonta su entrada; la salida de 220 ms ocurre dentro de los seis segundos, sin acumular temporizadores. Reproducir funciona en Studio y Ver diseño recupera la vista estática. El escenario distingue personal, rival de clase y doble récord.

Frontend completo PASS: 470 archivos, 3832 pruebas y 2 omitidas; build/TypeScript y lint PASS. Quality PASS, NEW=0, MOVED=0, policy_changed=false. Navegador: geometría mínima 280×72 y predeterminada 480×104, etiquetas personal/clase, prioridad única, caducidad sin nuevos datos, reproducción automática en Studio. La suite emite un aviso de fetch cancelado durante teardown de happy-dom; finaliza con código 0 y ninguna prueba fallida. Sin cambios Go respecto a la evidencia anterior.

La misma PR draft #1330 y tarea Asana recogen esta revisión. Pendientes revisión independiente y validación física LMU/Windows/OBS; sin merge ni release.
