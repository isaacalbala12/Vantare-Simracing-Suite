# Tester Diagnostics Pack y Bug-Report Bundle

Este documento sirve como inventario y guía para recopilar diagnósticos detallados de los testers privados de **Vantare Suite**, además de presentar el plan técnico para una futura funcionalidad de "Copiar Diagnóstico" integrada en la aplicación.

---

## 1. Inventario de Diagnóstico (Fase Alpha)

Para analizar un error reportado por un tester sin necesidad de revisar su código, debemos conocer la ubicación exacta de las configuraciones, logs, versiones y perfiles activos.

### A. Ubicación de Archivos de Configuración (Perfiles y Ajustes)

La aplicación **Vantare Suite** resuelve el directorio de configuraciones (`configsDir()`) en Windows siguiendo este orden de prioridad:

1. **Modo Portable**:
   *   *Ruta*: Carpeta `configs/` situada en el mismo directorio que el ejecutable `vantare.exe`.
   *   *Uso*: Es el método habitual de distribución manual para testers cercanos.
2. **Modo Desarrollo (CWD)**:
   *   *Ruta*: Carpeta `configs/` o `vantare-v2/configs/` en el directorio de trabajo actual.
3. **Modo Instalado (Estándar de Windows)**:
   *   *Ruta*: `%APPDATA%\Vantare\configs` (equivale a `C:\Users\<Usuario>\AppData\Roaming\Vantare\configs`).
   *   *Uso*: Creado automáticamente por el instalador NSIS. Esta ruta siempre tiene permisos de escritura sin requerir elevación UAC.

**Archivos clave a solicitar al tester:**
*   **Perfil Activo**: El archivo `.json` correspondiente al perfil que estaba en uso cuando ocurrió el fallo (ej. `example-racing.json` o un perfil creado por el usuario como `custom-my-profile.json`).
*   **Ajustes Globales**: `app-settings.json` (contiene la configuración de atajos globales de teclado, modo de delta preferido y el estado del muestreo de CPU).
*   **Ajustes del Actualizador**: `updater-settings.json` (contiene el registro de versiones omitidas o canales de actualización).

---

### B. Ubicación e Identificación de Logs

En la fase Alpha actual, la aplicación no escribe de forma persistente en un archivo de log propio en el modo instalado para evitar sobreescribir el disco del usuario. Sin embargo, existen fuentes de registro valiosas:

1. **Salida Estándar (Consola)**:
   *   Si el tester inicia la aplicación desde una terminal de comandos (`cmd` o `PowerShell`), toda la salida de depuración de Go (conexiones LMU, registro de hotkeys, arranque del servidor HTTP) se escribe directamente en la terminal. Se puede pedir al tester que redirija la salida a un archivo al arrancar:
       ```cmd
       vantare.exe > vantare-run.log 2>&1
       ```
2. **Logs de Desarrollo/Smoke (si ejecutan en carpetas de compilación)**:
   *   `wails-dev-out.log` y `wails-dev-err.log`: Registros generados por Wails durante el modo de desarrollo.
   *   `vantare-smoke-out.log` y `vantare-smoke-err.log`: Registros de las pruebas de humo automáticas en el directorio raíz.
3. **Registro de Consola del Navegador (WebView2)**:
   *   Si el error es visual o de renderizado en el Hub o en el overlay, el tester puede abrir las herramientas de desarrollo de WebView2 (si la build de desarrollo está activa) pulsando `F12` y exportar el log de la consola de JavaScript.

---

### C. Identificación de la Versión y Estado

*   **Versión de la App**: Definida internamente en `cmd/vantare/main.go` mediante la constante `version` (actualmente `v0.3.10.0`). Se emite al frontend reactivo con el evento `app:version`. Se visualiza en la barra inferior del Hub.
*   **Perfil Activo**: Identificable en el Hub (Topbar) o inspeccionando el archivo de ajustes para ver cuál fue el último cargado.
*   **Estado de Telemetría**: El chip global de la Topbar indica si el origen de datos es `Mock` (sintético), `LMU Conectado` (live en pista) o `Esperando LMU` (live esperando al simulador).

---

## 2. Checklist de Reporte para el Tester

Cuando un tester privado experimente un fallo, debe rellenar la siguiente checklist en el canal **`#alpha-bug-reports`** de Discord para darnos un diagnóstico inmediato sin fricciones:

```markdown
### 📝 Reporte de Incidencia - Vantare Suite

1. **Información del Sistema**
   * **Versión de Vantare**: [ej. v0.3.10.0 - Ver en la esquina inferior izquierda del Hub]
   * **Versión de Windows**: [ej. Windows 11 Pro 23H2]
   * **Ejecutado como Administrador**: [Sí / No]

2. **Estado de la Sesión**
   * **Simulador Abierto**: [Sí / No]
   * **Estado de Conexión en Topbar**: [LMU Conectado / Esperando LMU / Mock]
   * **Modo de Visualización**: [Overlay transparente / OBS Studio / Ambos]

3. **Descripción del Bug**
   * **¿Qué estabas haciendo?**: [ej. Editando las columnas de Standings en WidgetStudio]
   * **¿Qué falló?**: [ej. Al activar 'Interval' y hacer clic en Guardar, el botón se quedó congelado]
   * **Comportamiento esperado**: [ej. Guardar los cambios y volver a habilitar los controles]

4. **Archivos a Adjuntar (Obligatorios para problemas de layout/guardado)**
   * Copia el perfil afectado (ej. `custom-mi-perfil.json`) de la carpeta `configs/`.
   * Si arrancaste la aplicación desde terminal, adjunta el texto o captura de la consola.
   * [Arrastra aquí capturas de pantalla o grabaciones cortas del error visual]
```

---

## 3. Plan Técnico: Botón "Copiar Diagnóstico" (Futura Feature)

Para eliminar la necesidad de buscar archivos JSON manualmente en carpetas ocultas (`%APPDATA%`), diseñamos un flujo simplificado de un solo clic que recopila, sanitiza y copia al portapapeles un informe de diagnóstico completo en formato JSON.

### A. Backend: Recopilación Segura (Go)

Añadiremos un método a `SettingsService` o crearemos un nuevo `DiagnosticsService` en `internal/app/diagnostics.go`:

```go
package app

import (
	"runtime"
	"os"
	"github.com/vantare/overlays/v2/pkg/config"
)

type DiagnosticsInfo struct {
	AppVersion      string                `json:"appVersion"`
	OS              string                `json:"os"`
	Arch            string                `json:"arch"`
	GoVersion       string                `json:"goVersion"`
	NumCPU          int                   `json:"numCpu"`
	ConfigsDir      string                `json:"configsDir"`
	ActiveProfileID string                `json:"activeProfileId"`
	TelemetrySource string                `json:"telemetrySource"`
	TelemetryLive   bool                  `json:"telemetryLive"`
	AppSettings     *AppSettings          `json:"appSettings"`
	ActiveProfile   *config.ProfileConfig `json:"activeProfile,omitempty"`
}

type DiagnosticsService struct {
	version    string
	cfgDir     string
	profileSvc *ProfileService
	settingsSvc *SettingsService
	app        *App // acceso al estado de la telemetría
}

func NewDiagnosticsService(version string, cfgDir string, pSvc *ProfileService, sSvc *SettingsService, app *App) *DiagnosticsService {
	return &DiagnosticsService{
		version:     version,
		cfgDir:      cfgDir,
		profileSvc:  profileSvc,
		settingsSvc: sSvc,
		app:         app,
	}
}

// GetDiagnostics compila la información del sistema de forma sanitizada (sin nombres de usuario reales en rutas)
func (s *DiagnosticsService) GetDiagnostics() (*DiagnosticsInfo, error) {
	info := &DiagnosticsInfo{
		AppVersion: s.version,
		OS:         runtime.GOOS,
		Arch:       runtime.GOARCH,
		GoVersion:  runtime.Version(),
		NumCPU:     runtime.NumCPU(),
		ConfigsDir: s.sanitizePath(s.cfgDir),
	}

	if s.settingsSvc != nil {
		info.AppSettings = s.settingsSvc.Settings()
	}

	if s.profileSvc != nil && s.profileSvc.GetProfile() != nil {
		info.ActiveProfileID = s.profileSvc.GetProfile().ID
		info.ActiveProfile = s.profileSvc.GetProfile()
	}

	if s.app != nil {
		tInfo := s.app.SourceInfo()
		info.TelemetrySource = tInfo.Name
		info.TelemetryLive = tInfo.Live
	}

	return info, nil
}

// sanitizePath reemplaza la ruta del perfil de usuario (C:\Users\nombre...) por marcadores genéricos
// para proteger la privacidad del tester al compartir el informe en Discord.
func (s *DiagnosticsService) sanitizePath(path string) string {
	// Lógica básica de sanitización de rutas personales en Windows
	if len(path) == 0 {
		return ""
	}
	parts := os.Getenv("USERPROFILE")
	if parts != "" {
		return replaceAllIgnoreCase(path, parts, "<USERPROFILE>")
	}
	return path
}
```

### B. Registro en `main.go`

El servicio se registrará en Wails para ser accesible desde el frontend:
```go
diagSvc := app.NewDiagnosticsService(version, cfgDir, profileSvc, settingsSvc, vapp)
wailsApp.RegisterService(application.NewService(diagSvc))
```

### C. Frontend: Integración en la UI de Ajustes

En `frontend/src/hub/pages/SettingsPage.tsx`, se agregará una sección dedicada a diagnósticos de soporte técnico:

```tsx
import { useState } from "react";
// Importar enlace de Wails al DiagnosticsService generado
import { DiagnosticsService } from "../../bindings/github.com/vantare/overlays/v2/internal/app";

export function DiagnosticsSection() {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCopy = async () => {
    setLoading(true);
    try {
      const diag = await DiagnosticsService.GetDiagnostics();
      const payload = JSON.stringify(diag, null, 2);
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("Error al obtener diagnósticos", err);
      alert("No se pudieron generar los diagnósticos automáticamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-white/5 bg-white/2 p-4 rounded-xl flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold text-white">Soporte Técnico y Diagnósticos</h3>
        <p className="text-xs text-white/50">
          Si experimentas un error, puedes copiar un paquete de diagnóstico seguro con la configuración actual
          de la aplicación para compartirlo en el canal de soporte. Las rutas personales de tu equipo se sanitizan automáticamente.
        </p>
      </div>

      <button
        onClick={handleCopy}
        disabled={loading}
        className="self-start px-4 py-2 bg-vantare-red-500 hover:bg-vantare-red-600 disabled:bg-white/10 text-white text-xs font-mono rounded-lg transition-colors flex items-center gap-2"
      >
        {loading ? "Generando..." : copied ? "✓ ¡Copiado al Portapapeles!" : "Copiar Paquete de Diagnóstico"}
      </button>
    </div>
  );
}
```

Este diseño garantiza una recopilación de datos 100% segura para la privacidad de los usuarios, extremadamente simple para los testers y de alta utilidad técnica para el equipo de desarrollo.
