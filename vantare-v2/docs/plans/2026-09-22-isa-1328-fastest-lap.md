# ISA-1328 · Aviso de vuelta rápida

Petición y diseño aprobados por Isaac: convertir el aviso morado del boceto de marketing en un widget real. Seguimiento: https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218762634127535. Puente CI: GitHub #1328. Base: nightly e6d7d2b5.

## Diseño y alcance

Widget independiente `fastest-lap`, sistema Efficiency, banner horizontal con cronómetro morado, piloto, tiempo protagonista, fondo carbón y franjas rojas. Se coloca y redimensiona con los controles existentes de Studio. Sin dependencias nuevas ni cambios de arquitectura. Un renderer compartido conserva el diseño en Studio, Desktop, OBS y Workshop.

La opción inicial propuesta es la mejor vuelta de la clase del jugador, con selector para toda la sesión, seis segundos de duración y nombre del piloto opcional. Las preferencias se validan y guardan como contenido del widget. El idioma procede del contexto común es/en/pt/it.

La fuente es la clasificación Overlay V2 existente. Solo tiempos finitos positivos y frescos son candidatos; se comparan a precisión de milisegundos. La primera muestra establece la referencia y no dispara un aviso histórico. Solo una mejora estricta posterior genera un aviso. No se confunden empates, cambios de piloto o filas que desaparecen con nuevas vueltas rápidas. Sesión/epoch, fuente no live, cambio de alcance o reinicio descartan la presentación y establecen una nueva referencia. Snapshots repetidos o fuera de orden no reactivan avisos. Una nueva mejora sustituye al aviso anterior y reinicia su duración. Caduca aunque no lleguen más frames. Sin sonido ni cambios en la telemetría de origen.

Alternativas consideradas: un distintivo permanente repetiría la función del Standings; incorporar el aviso a Racing Flags mezclaría una notificación deportiva con una señal de seguridad. Se elige widget independiente para permitir posición y visibilidad propias.

## Ejecución

- [x] Leer contratos, base y arquitectura; localizar datos y diseño aprobado.
- [x] Registrar Asana y puente CI; preparar rama y worktree aislados.
- [x] Añadir tipo, definición, detector probado y presentación temporal local.
- [x] Registrar en Studio, persistencia, permisos y transporte con los contratos existentes.
- [x] Implementar el renderer y catálogos de idioma; añadir escenario reproducible de Workshop.
- [x] Verificar casos reales del contrato, interacción, expiración, build/typecheck y lint.
- [ ] Registrar evidencia, handoff, roadmap y PR draft; sin promoción implícita.

Archivos previstos: nuevo directorio widget-types/fastest-lap y renderer Efficiency; registros/tipos/manifest/catálogo/política/config/transporte existentes; catálogos es/en/pt/it; fixture Workshop; pruebas focales y documentos de entrega.
La prueba física con LMU/Windows se declarará pendiente si no hay una sesión real disponible.


## Evidencia del candidato

Frontend: 470 archivos y 3814 pruebas PASS, 2 omitidas; después del ajuste del escenario, 44 pruebas focales de Workshop PASS. Build/TypeScript y lint PASS. Go: perfiles/config y política de rendimiento con `-race` PASS; guardas de permisos y pruebas del nuevo widget con `-race` PASS; `go vet` de los paquetes modificados PASS. Quality PASS, NEW=0, MOVED=0, sin cambios de reglas o baselines.

La suite Go global se ejecutó con timeout de 60 s por paquete y falla en áreas ajenas al cambio: símbolos Windows en cmd/vantare, launcher, ruta Windows y Diagnostics/SQLite. No se presenta como verde. Revisión manual de navegador: primer frame sin aviso, nueva marca visible, caducidad sin nueva telemetría, volver atrás y repetir; composición legible en 480×104 y preview reducido a 280×72.

Pendientes de aceptación: revisión independiente y prueba física LMU/Windows/OBS. La ruta local `/workshop?widget=fastest-lap&system=vantare-functional&surface=studio&scene=fastest-lap-alert` muestra el componente real con datos de demostración. En Desktop/OBS, avanzar del primer al segundo paso activa el aviso.
