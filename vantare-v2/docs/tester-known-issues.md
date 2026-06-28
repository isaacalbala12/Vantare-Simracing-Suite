# Incidencias Conocidas (Known Issues) - Beta Abierta

Este documento contiene la lista oficial de problemas conocidos, limitaciones del alcance actual y comportamientos esperados en la versión **v0.3.10.0** de **Vantare Suite**. Por favor, revisa esta lista antes de reportar un fallo en Discord.

---

## 0. Widget states

Los widgets tienen tres estados de madurez, documentados en la guia del tester:

- ✅ **Stable**: Relative, Standings, Delta. Listos para uso general con datos live LMU.
- 🟡 **Tester**: Pedals, Ingeniero notifications. Funcionales, pueden tener cambios.
- 🔴 **Experimental**: Track Map, Input Telemetry/Trace. No disponibles.

---

## 1. Incidencias por Severidad

### 🔴 Bloqueantes
*   **Ninguno detectado**: No existen fallos conocidos que impidan el inicio de la aplicación o el uso de las funciones principales de edición y visualización de overlays bajo condiciones normales de uso.

### 🟡 Importantes
*   **Advertencia de SmartScreen (Ejecutable no firmado)**:
    *   *Síntoma*: Windows Defender o SmartScreen pueden bloquear la ejecución de `vantare.exe` o `vantare-amd64-installer.exe` mostrando una pantalla roja/azul de advertencia.
    *   *Causa*: Los ejecutables de la fase Alpha/Beta no cuentan con firma digital comercial.
    *   *Solución*: Haz clic en **"Más información"** y luego en **"Ejecutar de todas formas"**.
*   **Ingeniero en Vivo con LMU Pendiente (Fase EN6)**:
    *   *Síntoma*: El spotter del Ingeniero no reacciona a los datos en tiempo real mientras conduces en el simulador.
    *   *Causa*: El adaptador para leer el buffer en vivo de LMU está aparcado en esta fase.
    *   *Solución*: Prueba la sección de Ingeniero utilizando el reproductor de simulación/replay interno del Hub.
*   **Atajos globales inactivos en carrera (Privilegios UAC)**:
    *   *Síntoma*: Al pulsar las hotkeys globales (ej. `ctrl+shift+v`) mientras estás en pista en LMU, no ocurre nada, aunque sí funcionan si estás en el escritorio de Windows con el Hub activo.
    *   *Causa*: El simulador LMU se está ejecutando con privilegios elevados (como Administrador) y Vantare con privilegios normales. Windows por seguridad impide que procesos con menor nivel de integridad capturen el teclado de procesos elevados.
    *   *Solución*: Cierra Vantare Suite y ejecútala explícitamente como Administrador (clic derecho > *Ejecutar como administrador*).

### 🔵 Menores
*   **Confusión con la columna "Gap" en Práctica/Qualy (Standings)**:
    *   *Síntoma*: Durante sesiones de práctica o clasificación, la columna predeterminada `gap` (brecha) muestra tiempos de vuelta debido a lógica legacy heredada, lo que puede confundirse con la columna `bestLap`.
*   **Densidad visual en widgets pequeños**:
    *   *Síntoma*: Si activas muchas columnas opcionales (Vuelta rápida, Última vuelta, etc.) en widgets configurados con dimensiones físicas muy reducidas en `LayoutStudio`, los textos pueden superponerse.
    *   *Solución*: Incrementa el tamaño del widget en `LayoutStudio` o activa la opción de "Recorte de nombre" en la configuración de la variante dentro de `WidgetStudio`.
*   **Atajo global no responde (Colisión de registro)**:
    *   *Síntoma*: Un atajo configurado en los Ajustes (ej. `ctrl+shift+v`) no responde en absoluto, o se escribe un aviso de fallo en los logs al iniciar.
    *   *Causa*: Otra aplicación en segundo plano (Discord, OBS Studio, Steam o software auxiliar de la tarjeta gráfica) ya ha registrado de forma exclusiva esa combinación con Windows.
    *   *Solución*: Entra a la página de **Ajustes** del Hub de Vantare, cambia la combinación (por ejemplo, agregando `alt` o cambiando la letra) y haz clic en **Guardar atajos**.
*   **Delta best live pendiente de prueba manual con LMU real**:
    *   *Síntoma*: El widget Delta ya usa el delta nativo de LMU cuando está disponible, pero esta build todavía necesita validación prolongada en pista con distintos estados de sesión.
    *   *Causa*: La corrección backend/frontend está implementada y testeada, pero la verificación automatizada no sustituye una sesión real con Shared Memory de LMU.
    *   *Solución*: Si pruebas LMU live, confirma que los valores negativos aparecen en verde al mejorar y los positivos en rojo al perder tiempo.
*   **Autoupdater: releases sin checksum no instalables desde la app**:
    *   *Síntoma*: Si una GitHub Release no incluye el sidecar `.sha256`, el updater rechaza la instalacion.
    *   *Causa*: La beta exige verificacion SHA256 antes de ejecutar un instalador descargado por la app.
    *   *Solución*: Usa releases que incluyan `.sha256`. Si una release historica no lo incluye, descarga manualmente desde Discord/GitHub y verifica el hash publicado con `certutil -hashfile`.
*   **Autoupdater: smoke de integracion contra release real pendiente**:
    *   *Síntoma*: El updater se ha probado en entorno controlado contra un prerelease real, pero no se ha ejecutado una validación completa desde un tester descargando e instalando una release pública.
    *   *Solución*: Si encuentras errores al actualizar desde la app (botón de actualizar que no responde, descarga que falla, instalador que no se lanza), reportalo en `#beta-bug-reports`.

---

## 2. Limitaciones de Diseño y Alcance (Fuera de Scope)

Los siguientes comportamientos son **decisiones de diseño intencionadas** o características planificadas para fases posteriores, por lo que **no deben reportarse como fallos**:

1.  **Sin audio/voces en el Ingeniero**: El spotter no emite sonidos ni síntesis de voz (TTS). Las alertas y notificaciones son puramente visuales y textuales.
2.  **Widgets incompletos (Pedals)**: El widget de pedales actual es estético y su calibración completa se realizará en una fase posterior.
3.  **Exclusividad de Le Mans Ultimate**: La suite está optimizada únicamente para leer la memoria compartida de LMU. No hay soporte en esta fase para iRacing, Assetto Corsa, rFactor 2 u otros simuladores.
4.  **OBS por LAN (Doble PC)**: La integración con OBS funciona de manera local en el mismo PC. La optimización de red para streaming en doble PC está programada para más adelante (configuración manual posible).
5.  **Sin cuentas de usuario ni pagos**: No hay inicio de sesión, suscripciones ni pasarelas de pago activas en esta compilación.
6.  **Sin firma de codigo Authenticode**: Los ejecutables no estan firmados digitalmente. Windows SmartScreen mostrara una advertencia. Es un trade-off aceptado para acelerar el feedback de la beta. La firma se implementara antes del release estable v1.0.
7.  **Widget Track Map y Input Telemetry/Trace**: Son experimentales y no estan disponibles para testers en esta fase.
8.  **No release por commit**: No se publica una GitHub Release por cada cambio. Solo versiones etiquetadas con tag `v*` y checklist del runbook completado.
