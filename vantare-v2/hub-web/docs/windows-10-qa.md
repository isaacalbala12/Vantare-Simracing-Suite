# Prueba pendiente en Windows 10

Falta un equipo o VM con Windows 10 22H2 x64, escritorio interactivo y permiso de Isaac para ejecutar el candidato QA. El servidor actual y la declaración de soporte de Electron no sustituyen esta prueba. No hace falta cuenta, juego ni servicio externo.

1. Registrar edición, build de Windows (`winver`), CPU, RAM y escala. Usar una carpeta local de QA con espacio para el candidato y datos desechables.
2. Copiar el candidato de QA cerrado y su informe de hashes. Verificar primero el ZIP y manifiesto; no ejecutar instalador ni sustituir una instalación existente.
3. Ejecutar los smokes del puente y Ajustes con el anfitrión incluido, datos QA y núcleo local. Registrar SHA, versión exacta de Electron y resultado JSON. Comprobar arranque sin destello, controles de ventana, cierre y reapertura, desconexión del núcleo y rechazo de documento protegido.
4. Repetir claro/oscuro a escalas 100, 125 y 150 %. Comprobar que la ventana cabe en workArea, fuentes locales y respaldo Consolas, teclado, diálogos y selectores dentro de diálogos. Guardar capturas y comparación con la referencia GPUI.
5. Ejecutar `scripts/check-asar-integrity.ts` con `VANTARE_HUB_QA_ROOT` y `VANTARE_HUB_CANDIDATE_ROOT`: intacto abre; índice y contenido manipulados deben fallar. Conservar result.json, SHA del asar sellado y stderr.
6. En el flujo con núcleo QA, entrar en Live y comprobar cero procesos Electron y ausencia del lock de instancia al reabrir. Sin credenciales ni endpoints reales.
7. Adjuntar evidencia a #1995. No declarar Windows 10 validado hasta completar esta lista en esa máquina.

Las mediciones de rendimiento se repiten con el procedimiento de `measure.ts`; los resultados de máquinas diferentes se presentan separados.
