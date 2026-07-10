# Guia de Pruebas para Testers - Vantare Suite (Beta Publica v0.1.0.0)

Bienvenido a la **Beta Publica** de **Vantare Suite** — la suite local para sim racing con Overlays Studio, Ingeniero y telemetria live para Le Mans Ultimate.

> [!IMPORTANT]
> **Aviso de SmartScreen / Firma de codigo no disponible**
> Los ejecutables de esta beta **no tienen firma digital (Authenticode)**. Windows SmartScreen mostrara una advertencia de "Editor desconocido" al ejecutar el instalador o el portable. Esto es normal y esperado. Haz clic en **"Mas informacion"** -> **"Ejecutar de todas formas"**. La firma de codigo se implementara antes del release estable v1.0.
> Los checksums SHA256 publicados junto a cada descarga permiten verificar la integridad del binario (ver seccion 8).

---

## 1. Requisitos del sistema y preparacion

- **Sistema operativo**: Windows 10 u 11 (64 bits).
- **Simulador (opcional)**: Le Mans Ultimate (LMU) instalado y con Shared Memory habilitada para probar datos live.
- **Cuenta de Google**: obligatoria para iniciar sesion. La app no arranca en modo utilizable sin login valido.
- **Modo sin simulador**: la app incluye un modo **Mock** con datos sinteticos por defecto si el simulador no esta abierto, para que puedas probar la interfaz y los widgets en cualquier momento.
- **Conexion a internet**: necesaria para el login y para la validacion de licencia. Tras validar, hay 24 horas de gracia offline.

---

## 2. Instalacion y ejecucion

Tienes dos metodos:

### Metodo A: instalador NSIS (recomendado)

1. Ejecuta `vantare-amd64-installer.exe`.
2. Si SmartScreen aparece, pulsa **"Mas informacion"** -> **"Ejecutar de todas formas"**.
3. Sigue el asistente y abre la app desde el acceso directo.

### Metodo B: ejecutable portable

1. Extrae el zip en una carpeta local.
2. Asegurate de que la carpeta `configs/` con los perfiles recomendados esta junto al `vantare.exe`.
3. Haz doble clic en `vantare.exe`.

### Metodo C: build local desde codigo fuente (desarrolladores)

Si tienes el codigo fuente y quieres compilar localmente, sigue estos pasos. Necesitas: **Go 1.25+**, **Node 20+**, **pnpm**.

#### Paso 1: Configurar `.env.local`

Copia `.env.example` a `frontend/.env.local` y rellena las credenciales de Supabase:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
# Edita frontend/.env.local con tus credenciales reales
```

El archivo debe contener al menos:
```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

> [!WARNING]
> Sin `.env.local` con credenciales reales, la app mostrara "Supabase no configurado" y no podras iniciar sesion.

#### Paso 2: Instalar dependencias y compilar frontend

```powershell
cd vantare-v2
corepack pnpm --dir frontend install
corepack pnpm --dir frontend build
```

#### Paso 3: Compilar binario Go con Supabase embebido

```powershell
# Mapear variables de entorno desde .env.local
$envFile = Get-Content frontend\.env.local | Where-Object { $_ -match '^\s*VITE_SUPABASE_' }
foreach ($line in $envFile) {
  $parts = $line -split '=', 2
  if ($parts.Count -eq 2) {
    if ($parts[0].Trim() -eq 'VITE_SUPABASE_URL') { $env:VANTARE_SUPABASE_URL = $parts[1].Trim() }
    if ($parts[0].Trim() -eq 'VITE_SUPABASE_ANON_KEY') { $env:VANTARE_SUPABASE_ANON_KEY = $parts[1].Trim() }
  }
}

# Generar archivo temporal con credenciales embebidas
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\generate_supabase_config.ps1 -OutFile .\cmd\vantare\supabase_build.go

# Compilar
try {
  go build -tags production -trimpath -buildvcs=false -ldflags "-w -s -H windowsgui" -o .\bin\vantare.exe .\cmd\vantare
} finally {
  Remove-Item .\cmd\vantare\supabase_build.go -ErrorAction SilentlyContinue
}
```

#### Paso 4: Ejecutar

```powershell
Start-Process -FilePath .\bin\vantare.exe -WorkingDirectory .\bin
```

> [!TIP]
> Para modo mock (sin LMU): la app arranca en modo mock por defecto si Le Mans Ultimate no esta abierto.

---

## 3. Login y planes (free, paid, suite)

Vantare **requiere inicio de sesion obligatorio** desde la primera pantalla. El unico proveedor habilitado para esta beta es **Google OAuth**.

### 3.1 Como iniciar sesion

1. Abre Vantare.
2. En la pantalla de bienvenida, pulsa **"Iniciar sesion con Google"**.
3. Autoriza la aplicacion en la ventana del navegador.
4. Vuelve a Vantare; la app validara la licencia automaticamente y pasara al Hub.

### 3.2 Planes disponibles

| Plan | Que incluye | Ideal para |
|------|-------------|------------|
| `free` | Vista previa de widgets, modo Mock sin live, presets de ejemplo. | Probar la app sin datos live y validar instalacion. |
| `paid` (Overlays) | Todo `free` + Overlays Studio con LMU live (Relative, Standings, Pedals, Delta). | Streamers y pilotos que solo necesitan overlays. |
| `suite` (Overlays + Ingeniero) | Todo `paid` + Ingeniero con notificaciones en overlay + presets compartibles. | Usuarios que quieran el paquete completo. |

### 3.3 Que pasa si no tienes plan activo

Tras iniciar sesion, si tu cuenta no tiene una suscripcion activa, Vantare mostrara la pantalla de planes. Elige `free` para probar la app con limites o suscribete a `paid` o `suite` desde el portal de pagos. Mas detalles sobre precios y conversion en `#beta-announcements` de Discord.

### 3.4 Gracia offline

Si tras validar la licencia pierdes conexion, la app sigue funcionando durante **24 horas** en modo `grace`. Pasado ese tiempo, pasara a `expired` y tendras que volver a conectarte para revalidar. La gracia solo se concede si ya habias validado online al menos una vez; una instalacion fresca sin cache no entra en gracia.

---

## 4. Flujo de pruebas recomendado

### Bloque A: Overlays Studio (edicion de widgets)

1. En el menu lateral del Hub, entra en **Overlays Studio**.
2. Abre el panel **Widgets** y selecciona uno:
   - **Relative** (stable).
   - **Standings** (stable).
3. Activa o desactiva columnas opcionales en el panel derecho y modifica anchos, formatos de tiempo y alineacion.
4. En **Standings**, cambia el selector de escenario mock entre `Practica`, `Qualy` y `Carrera` para validar datos sinteticos.
5. Cambiar el escenario mock **no activa el boton Guardar**. Solo las columnas y formatos reales lo hacen.
6. Pulsa **Guardar** y confirma que el cambio persiste al cerrar y reabrir la app.
7. **Galeria de disenos oficiales**: en el panel derecho del widget seleccionado, debajo de los presets de usuario, aparece la seccion **Disenos oficiales**. Para `Relative`, `Standings`, `Delta` y `Pedals` encontraras al menos 2 disenos por widget. Pulsa **Aplicar** sobre uno y comprueba que el widget cambia de apariencia y variante sin que se modifiquen la posicion ni el tamano en el layout. La galeria es solo lectura: no crea ni comparte disenos.

### Bloque B: gestion de perfiles y LayoutStudio

1. Vuelve a **Overlays Studio** y abre **Mis perfiles**.
2. Entra en **Recomendados por Vantare** y guarda como copia propia un perfil (`Clean Overlay` o `Le Mans Ultimate - Basic`).
3. En tu copia, pulsa **Activar** para marcarla como perfil activo (veras el badge `Activo`).
4. Pulsa **Abrir overlay** en la cabecera para abrir la ventana transparente a pantalla completa.
5. Pulsa **Editar layout** y arrastra o redimensiona los widgets. Pulsa **Guardar**.
6. El overlay abierto se actualiza en tiempo real con la nueva distribucion.

### Bloque C: Ingeniero

1. En el menu lateral, abre **Ingeniero**.
2. Revisa el control de sensibilidad del spotter y activa o desactiva los avisos.
3. Lanza un mensaje de prueba usando el reproductor de simulacion/replay.
4. Comprueba que el historial del Hub muestra los mensajes entrantes.
5. Abre tu overlay y verifica que el widget `engineer-notifications` muestra las alertas en tiempo real y desaparecen al expirar.

### Bloque D: actualizador automatico

1. Espera al banner de actualizacion en el Hub al iniciar la app (si hay una nueva version publicada).
2. Pulsa **Actualizar**. La app descarga el instalador, verifica el SHA256 y lo ejecuta.
3. Si la release no incluye `.sha256`, el updater rechaza la instalacion desde la app. En ese caso, descarga manualmente desde `#beta-downloads` y verifica el hash publicado.

---

## 5. Atajos de teclado globales (hotkeys)

Vantare incluye hotkeys globales nativas en Windows. Funcionan aunque el simulador tenga el foco.

| Atajo | Accion |
|-------|--------|
| `Ctrl+Shift+V` | Mostrar u ocultar el overlay activo. |
| `Ctrl+Shift+E` | Entrar o salir del modo edicion in-place sobre el overlay. |
| `Ctrl+Shift+Flecha derecha` | Cambiar al siguiente perfil. |
| `Ctrl+Shift+Flecha izquierda` | Cambiar al perfil anterior. |

> [!IMPORTANT]
> **Privilegios de administrador (UAC)**
> Si ejecutas Le Mans Ultimate como Administrador (comun para compatibilidad de hardware), Windows impedira que Vantare capture las hotkeys con permisos normales. Solucion: ejecuta **tambien** Vantare como Administrador (clic derecho -> Ejecutar como administrador).

> [!WARNING]
> **Colisiones con otros programas**
> Si otra app (GeForce Experience, AMD Adrenalin, Steam, Discord, OBS Studio, etc.) ya registro la misma combinacion, Windows no dejara a Vantare tomarla. Cambia la combinacion en **Ajustes -> Atajos**.

---

## 6. Widgets y su estado actual

| Widget | Estado | Que puedes probar |
|--------|--------|-------------------|
| **Relative** | stable | Columnas configurables, filtros de clase/rango, ancho intrinseco. |
| **Standings** | stable | Columnas configurables, escenarios mock (Practica/Qualy/Carrera), variantes schema v2. |
| **Delta** | stable | Delta best live nativo LMU, `Target` y `Lap`. Negativos en verde, positivos en rojo. |
| **Pedals** | tester | Maqueta compacta CLT/BRK/THR. Colores editables desde WidgetStudio. |
| **Ingeniero (notifications)** | tester | Widget de notificaciones del spotter. Funciona en modo simulacion/replay. |
| **Track Map** | experimental | En desarrollo, no disponible. |
| **Input Telemetry/Trace** | experimental | En desarrollo, no disponible. |

> **stable**: listo para uso general. **tester**: funcional pero puede tener cambios. **experimental**: en desarrollo, no disponible.

---

## 7. Que NO esta soportado todavia (fuera de alcance)

No reportes como fallos las siguientes caracteristicas planificadas para fases posteriores:

- **Ingeniero con LMU en vivo real**: la conexion del spotter con LMU live esta pendiente. Actualmente solo modo simulacion/replay.
- **Audio/Voces TTS del Ingeniero**: los avisos son visuales y textuales.
- **Widget Pedals completo**: es una maqueta estetica. Calibracion profunda llega post-beta.
- **Soporte multisimulador**: solo Le Mans Ultimate. iRacing, Assetto Corsa, etc. llegaran tras el release estable v1.0.
- **Doble PC / LAN para OBS**: la URL local funciona; la optimizacion de red para streaming remoto queda fuera de alcance. Configuracion manual posible (ver guia OBS).
- **Firma de codigo Authenticode**: ver seccion siguiente y `docs/tester-known-issues.md`.
- **Galeria de disenos de widgets**: incluida en esta build como catalogo de disenos oficiales de solo lectura. La galeria aplica apariencia y variante; no toca `position` ni `tamano`, no crea archivos ni comparte disenos. Marketplace, cloud sync o compartir disenos quedan fuera de alcance de la beta.

---

## 8. Aviso de SmartScreen y verificacion de checksums SHA256

Esta build **no tiene firma digital Authenticode**. Windows SmartScreen mostrara una advertencia de "Editor desconocido" al ejecutar el instalador o el portable. Es un comportamiento esperado, no un fallo.

**Pasos:**

1. Pulsa **"Mas informacion"**.
2. Pulsa **"Ejecutar de todas formas"**.
3. Verifica el checksum SHA256 publicado en `#beta-downloads` o en el archivo `.sha256` sidecar contra tu descarga:

```powershell
Get-FileHash .\vantare-amd64-installer.exe -Algorithm SHA256
# o bien
certutil.exe -hashfile .\vantare-amd64-installer.exe SHA256
```

Si los hashes coinciden, tu archivo no ha sido alterado.

La firma de codigo se implementara antes del release estable v1.0.

---

## 9. Politica de versionado

- **No se publica release por cada commit.** Las versiones se acumulan y se publican cuando hay un tag `v*` que cumple el checklist del runbook.
- Las builds de desarrollo diarias no se distribuyen a testers.
- Cada version publicada lleva entrada en `docs/changelog.md` y anuncio en `#beta-announcements`.
- La linea publica es `v0.1.x`. Las builds internas previas (`v0.3.*`) son **historicas y no se anuncian**.

---

## 10. Como reportar bugs

Si encuentras un comportamiento inesperado, error visual o problema de rendimiento:

1. **Captura de pantalla o video** del problema.
2. **Pasos para reproducir**: que acciones realizaste justo antes del fallo.
3. **Archivos de configuracion**: si el problema es con perfiles, adjunta el JSON afectado de `configs/`.
4. **Log de errores**: si la app se cierra, adjunta cualquier `.log` de la raiz.

Usa el canal **`#beta-bug-reports`** de Discord con la plantilla de `docs/tester-feedback-process.md`.

---

## 11. Documentos relacionados

- [Incidencias conocidas (Known Issues)](tester-known-issues.md): lista oficial de problemas y limitaciones.
- [Protocolo de feedback y reporte de bugs](tester-feedback-process.md): canales de Discord y plantilla obligatoria.
- [Guia OBS Studio local](obs-local-setup.md): como configurar OBS en local.
- [Runbook de operaciones de release](release-beta-operations-runbook.md): flujo tecnico de publicacion (uso interno).
- [Changelog publico](changelog.md): historial de versiones publicadas.