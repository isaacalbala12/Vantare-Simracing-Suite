# ISA-1315 · Idioma compartido de app y widgets

Aprobación de producto: Isaac, 22/09/2026, en la conversación de widgets. Solicita traducir las etiquetas (PRACTICE ↔ PRÁCTICA) siguiendo el idioma de la app, acepta el alcance compartido y exige que no se recalcule con telemetría ni afecte a las animaciones. No requiere una segunda aprobación para concretar este diseño.

Seguimiento principal por instrucción explícita de Isaac: [Asana](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218757534554194), En curso. [GitHub #1315](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1315) es puente técnico. Base nightly `e41f703c3a015321024766cc5da55d9a6def1bcb`. Rama `vantareapp/isa-1315-widget-locale`. Roadmap: `milestones:functional-widget-design`.

## Diseño aprobado

1. Una preferencia UI global es/en/pt/it, independiente de audio Engineer, persistida por el servicio de ajustes existente. La preferencia antigua local se conserva al inicializar cuando todavía no exista una canónica. Las ventanas consumidoras no sobrescriben al arrancar una preferencia ya establecida. Los guardados generales de ajustes conservan el idioma actual aunque su formulario sea anterior.
2. Adaptadores en los puntos de entrada, nunca en renderizadores: Wails para ventanas nativas y una instantánea inicial más eventos para OBS. El backend valida y persiste antes de publicar. Suscripción y snapshot deben ser coherentes; cola acotada a última preferencia, limpieza al desconectar y autoridad explícita al reconectar. No copiar el polling del stream de política de widgets. No escrituras HTTP sin autenticación añadidas para el idioma; OBS es consumidor. Workshop web autónomo usa la misma preferencia/cache del navegador y eventos de almacenamiento; debe explicar su modo de demostración cuando no hay backend nativo.
3. Contexto estable compartido de idioma, catálogos estáticos y caché de carga existentes. Resolver/seleccionar etiquetas solo al cambiar idioma o el código semántico de sesión. La telemetría mantiene sus códigos; nombres de pilotos, circuitos y clases no se traducen. No convertir sessionLabel a idioma dentro del ViewModel: lo consumen también modo de sesión y reset de motion.
4. Todos los puntos de entrada proporcionan contexto sin cambiar keys ni desmontar widgets al cambiar idioma. Catálogo Eficiencia completo para cuatro idiomas, incluyendo sesión, estados y etiquetas; abreviaturas universales/unidades se conservan cuando corresponde. Sin idiomas por widget ni nuevos frameworks.

## Alternativas descartadas

- Solo localStorage/storage: sencillo para pestañas del mismo origen pero no sincroniza fuentes OBS con origen distinto.
- Traducir dentro de la muestra/ViewModel o sondear el idioma: incumple el requisito explícito de coste estable y mezcla presentación con telemetría.
- Guardar todos los ajustes para cada selección: activa trabajo no relacionado y admite sobrescritura desde formularios antiguos.

## Plan de implementación y verificación

1. Worker único implementa preferencia/transportes, contexto y etiquetas; tests de persistencia fallida, carrera de cambios, suscripción/reconexión, valores inválidos y conservación de preferencia previa.
2. Tests de integración renderizan etiquetas cambiando idioma y luego muchas muestras: ninguna lectura adicional de storage, carga de diccionario, suscripción, mensaje ni resolución de etiqueta de sesión con código estable. Mantener identidad del renderer y motion durante el cambio.
3. Ejecutar pruebas frontend/Go, build, lint, calidad NEW=0 y MOVED=0; no modificar política, baselines, dependencias ni configuración de analizadores.
4. Orquestador actualiza únicamente hito de roadmap declarado, genera JSON desde base, fragmento changelog y handoff; reviewer independiente revisa persistencia/concurrencia, wiring real de todos los entrypoints y evidencia de rendimiento.
5. Entregar rama/PR draft y seguimiento releído. No merge ni promoción. La PR #1306 conserva el trabajo de motion aceptado y no se fusiona por esta tarea. Composición local del harness solo si puede preservar esa revisión y sin sustituir su fuente silenciosamente.

## Límites de las afirmaciones

El cambio de idioma sí requiere una actualización de interfaz; la garantía es no añadir trabajo de localización por frame/tick ni tráfico periódico para consultarlo. Tests y revisión de wiring no sustituyen verificación física Windows/OBS. La automatización de navegador está actualmente denegada por la herramienta; no se elude por otro canal.
