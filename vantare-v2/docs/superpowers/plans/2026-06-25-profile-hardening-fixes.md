# Plan de Endurecimiento de Perfiles y Persistencia (PROF1-Plan)

Este miniplan detalla el diseño técnico para corregir las debilidades menores (P2/P3) detectadas en la auditoría de perfiles de **Vantare Suite**, asegurando la integridad física de los archivos JSON en disco y mejorando la transparencia ante errores de corrupción de datos.

---

## 1. Alcance del Plan

El plan de corrección se enfoca exclusivamente en dos mejoras de fiabilidad a nivel de persistencia en disco e informes de error, sin alterar la estructura del esquema v2 ni rediseñar la interfaz visual actual:

1.  **Escritura Atómica en Disco (PROF-H1 - P2)**: Sustituir la sobreescritura directa de archivos por un patrón de escritura segura mediante archivo temporal y renombrado atómico en Go.
2.  **Notificación de Perfil Fallback (PROF-H4 - P3)**: Informar de manera transparente al usuario mediante una notificación visual en el Hub si la aplicación no pudo cargar su perfil de inicio por corrupción y tuvo que recurrir al perfil por defecto en memoria.

---

## 2. Propuesta de Cambios Técnicos (Plan-Only)

### A. Backend (Go): Escritura Atómica en `pkg/config/profile.go`

Actualmente, `SaveFile` utiliza `os.WriteFile` directamente sobre la ruta del archivo del perfil. Si el proceso es interrumpido en plena escritura por el sistema operativo, el archivo se corrompe.

**Diseño de la solución:**
Implementar un mecanismo de escritura atómica en el sistema de archivos:
1. Escribir el JSON formateado en un archivo temporal en el mismo directorio (ej. `.custom-profile.json.tmp`) usando un prefijo aleatorio para evitar colisiones.
2. Sincronizar los búferes del archivo a nivel de disco físico mediante `f.Sync()` antes de cerrarlo, garantizando que todos los bytes estén físicamente en el almacenamiento.
3. Cerrar el archivo temporal.
4. Utilizar `os.Rename` para reemplazar de forma atómica el archivo temporal por el archivo original. En Windows, esto requiere considerar que el archivo destino podría estar bloqueado, por lo que se debe capturar el error y aplicar reintentos breves si es necesario.

**Ejemplo de implementación propuesta en `profile.go`:**
```go
func SaveFile(path string, p *ProfileConfig) error {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal profile: %w", err)
	}

	dir := filepath.Dir(path)
	tmpFile, err := os.CreateTemp(dir, "." + filepath.Base(path) + "-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary profile file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer func() {
		if _, err := os.Stat(tmpPath); err == nil {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("write temporary profile: %w", err)
	}

	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("sync temporary profile: %w", err)
	}

	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("close temporary profile: %w", err)
	}

	// En Windows, Rename fallará si el archivo destino existe y está abierto por otro handle.
	// Wails/WebView2 no retiene handles abiertos en lectura de JSON de perfiles, por lo que Rename
	// es seguro bajo condiciones normales.
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("atomic rename profile %s: %w", path, err)
	}

	return nil
}
```

---

### B. Notificación de Carga Fallback (Go/React)

Cuando la carga en `main.go` falla, se inicializa el perfil en memoria con `default-fallback`. Queremos que el Hub reciba este estado para que el tester sepa de inmediato que su archivo JSON estaba dañado y que los cambios no se guardarán sobre el archivo original corrupto hasta que lo solucione.

**Diseño de la solución:**
1. Agregar un campo `Corrupt bool` o `LoadedFromFallback bool` en el estado en memoria de `ProfileService`.
2. Al llamar a `GetProfile()` desde el frontend, el JSON retornado incluirá este marcador.
3. En `frontend/src/hub/HubApp.tsx` o `Topbar.tsx`, si el perfil cargado tiene `LoadedFromFallback: true`, se renderizará un banner o chip amarillo discreto en la parte superior:
   - *"Advertencia: Tu perfil de inicio no pudo ser leído (JSON corrupto). Se ha cargado la plantilla por defecto. Si guardas cambios, se creará un archivo nuevo."*

---

## 3. Plan de Verificación

### Pruebas Unitarias (Go)
- Añadir un test en `profile_test.go` que fuerce un error de escritura (por ejemplo, pasándole un directorio inexistente o permisos de solo lectura) y verificar que el archivo original permanece intacto y sin cambios parciales.
- Verificar que el temporal se elimina correctamente en todas las ramas de error de `SaveFile`.

### Verificación Manual
1. Iniciar la app, realizar modificaciones de layout y comprobar en el sistema de archivos que los perfiles se guardan con el formato correcto.
2. Modificar a propósito un archivo de perfil JSON (ej. borrando una coma para romper la sintaxis), iniciar la app y confirmar que aparece la advertencia visual y la app no se bloquea.
