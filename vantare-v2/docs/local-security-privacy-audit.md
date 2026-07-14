# Auditoría de Seguridad Local y Privacidad (SEC1)

Este documento presenta una auditoría técnica sobre los riesgos de seguridad local, privacidad y protección de datos en **Vantare Suite** para la fase de Alpha y preparación de la Beta Privada. Se evalúan los webhooks de Discord, los datos recopilados en los diagnósticos, el servidor local de telemetría, el comportamiento en red local (LAN) y las advertencias del sistema operativo.

---

## 1. Análisis de Vectores de Riesgo y Privacidad

### A. Webhooks de Discord y Seguridad en CI/CD
- **Estado actual (ISA-95)**: Los workflows de release, testers, beta pública y desarrollo activo usan exclusivamente su secreto `DISCORD_*_WEBHOOK_URL` dedicado. `discord-known-issues.yml` conserva su nombre físico para mantener el ID registrado de GitHub Actions, pero ahora publica desarrollo activo; el fallback genérico fue retirado.
- **Evaluación**: Cumple al 100% con las directrices de seguridad. No existen credenciales, tokens ni URLs de webhooks reales hardcodeados en el código fuente público, mitigando el riesgo de robo de webhooks o spam malintencionado en los canales de la comunidad.

---

### B. Paquete de Diagnósticos y Privacidad del Usuario
- **Estado actual**: La función `diagnostics_service.go` recopila información técnica sobre el sistema operativo, CPU, arquitectura, configuraciones del perfil activo y ajustes globales.
- **Sanitización de Rutas**: El servicio implementa de forma activa un mecanismo de sanitización de rutas personales en Windows:
  ```go
  func (s *DiagnosticsService) sanitizePath(path string) string {
      if len(path) == 0 {
          return ""
      }
      parts := os.Getenv("USERPROFILE") // ej: C:\Users\isaac
      if parts != "" {
          return replaceAllIgnoreCase(path, parts, "<USERPROFILE>")
      }
      return path
  }
  ```
  Esto convierte rutas privadas como `C:\Users\isaac\AppData\Roaming\Vantare` en `<USERPROFILE>\AppData\Roaming\Vantare`, eliminando los nombres y apellidos reales del usuario antes de que comparta el informe en el Discord de soporte.
- **Evaluación**: Excelente nivel de privacidad. Los diagnósticos no contienen información sensible del simulador, claves personales, IPs del usuario, cookies ni contraseñas. Compartir el paquete es 100% seguro.

---

### C. Servidor HTTP Local y Exposición LAN (0.0.0.0)
- **Estado actual**: Por defecto, el servidor HTTP en `main.go` se enlaza (bind) a `127.0.0.1:39261` (localhost), restringiendo el acceso exclusivamente al PC local. Sin embargo, para dar soporte a configuraciones de Doble PC (LAN), el usuario puede iniciar la app especificando el flag `-http 0.0.0.0:39261`.
- **Riesgos de Escucha en 0.0.0.0**:
  - *Espionaje de telemetría*: Cualquier dispositivo conectado a la misma red local (Wi-Fi o cable) puede acceder a la telemetría en vivo del juego (`/telemetry/stream`), ver los perfiles JSON (`/api/profile`) y leer las alertas del spotter (`/engineer/stream`).
  - *Ataques de denegación de servicio (DoS)*: Clientes maliciosos en la red local podrían abrir múltiples conexiones SSE redundantes para agotar los recursos de CPU del PC de juego.
- **Mitigación**:
  - Todos los endpoints del servidor HTTP remoto son estrictamente de **lectura** (`GET`). Las operaciones de modificación de datos (crear, editar o borrar perfiles y configuraciones) no están expuestas en la API HTTP del servidor local; se realizan exclusivamente a través de los canales IPC nativos de Wails, que son inaccesibles por red.
  - El riesgo de seguridad de los datos es bajo, dado que la telemetría del simulador no es información crítica de identidad o bancaria.
- **Recomendación de Seguridad**: Se debe advertir al usuario que **nunca realice redirección de puertos (port-forwarding) en su router doméstico** para exponer el puerto `39261` a Internet, puesto que eso permitiría a atacantes externos monitorizar su actividad y saturar su servidor local.

---

### D. Flujo de Datos SSE y Falta de Autenticación
- **Análisis**: El canal de Server-Sent Events `/telemetry/stream` transmite la telemetría del simulador en texto plano (HTTP sin cifrar) sin ningún token ni cabecera de autenticación.
- **Evaluación**: En una red LAN doméstica segura, esto es perfectamente aceptable y estándar. Sin embargo, si el usuario conduce en redes públicas inestables (ej. competiciones LAN de eSports públicas o Wi-Fi compartido de hoteles), un atacante podría interceptar su telemetría.
- **Mitigación**: Mantener la escucha por defecto exclusivamente en `127.0.0.1`. Solo habilitar la red abierta a `0.0.0.0` mediante una confirmación explícita del usuario o la ejecución manual del flag, manteniendo el sistema cerrado por defecto.

---

### E. SmartScreen de Windows y Ejecutables no Firmados
- **El Problema**: Al no contar con un certificado de firma digital comercial (Code Signing Certificate), Windows Defender y SmartScreen catalogan el instalador y portable de Vantare como archivos de editor desconocido de alto riesgo, mostrando pantallas de advertencia rojas o azules al tester al intentar ejecutarlos por primera vez.
- **Evaluación**: Esto no es un fallo de seguridad real del código de Vantare, sino una medida de seguridad corporativa estándar de Microsoft. Sin embargo, genera alta fricción y desconfianza en los testers.
- **Mitigación**: Para la alpha y beta cerrada, se mitiga mediante documentación explicativa en la guía del tester. Para la publicación de la release estable v1.0, **será obligatorio adquirir un certificado de firma digital EV o Estándar** para firmar los ejecutables, eliminando las pantallas de advertencia de SmartScreen de forma oficial.

---

## 2. Bloqueos Técnicos antes de la Beta Pública (Blocking before public beta)

Para garantizar una transición segura a la beta pública, se definen los siguientes requisitos obligatorios:

1.  **Firma Digital del Ejecutable**: Adquirir y configurar el certificado de firma de código en el pipeline de empaquetado final para eliminar las advertencias de SmartScreen de los sistemas de los usuarios.
2.  **Consentimiento de Exposición LAN en UI**:
    - La opción de escuchar en `0.0.0.0` no debe activarse mediante flags oscuros de consola. Debe integrarse como un toggle en la sección de Ajustes del Hub.
    - Al activar la escucha en red local, el Hub debe mostrar un mensaje emergente de advertencia: *"Advertencia de Privacidad: Activar la red local permitirá que otros dispositivos conectados a tu misma red Wi-Fi o cable accedan a tu telemetría y perfiles en vivo. Nunca expongas este puerto a Internet mediante redirección de puertos."*
3.  **Sanitización de logs de consola de Wails**: Asegurar que en el modo de producción (`dev_mode: false`) las llamadas y volcados de datos sensibles se reduzcan, evitando que logs de depuración huérfanos expongan información del sistema de archivos local en caso de un reporte manual.
