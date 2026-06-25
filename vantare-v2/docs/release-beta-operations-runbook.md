# Runbook de Operaciones de Release y Beta (OPS1)

Este documento describe el procedimiento estándar para llevar un cambio de software desde el estado "feature terminada" hasta "build publicada para testers en Discord", minimizando errores de versión, inconsistencias en el changelog, problemas con tags de Git y fallos en la ejecución de los workflows automatizados.

---

## 1. Checklist Pre-Release (Puertas de Calidad)

Antes de etiquetar una versión y notificar a los testers en Discord, se deben validar de forma obligatoria los siguientes puntos en el entorno local de desarrollo:

- [ ] **Working Tree limpio**: Ejecuta `git status --short`. No deben quedar archivos con cambios locales sin confirmar ni archivos huérfanos sin registrar que pertenezcan a la versión. Los cambios previos ajenos a tu tarea deben descartarse o comitearse por separado.
- [ ] **Tests locales en verde**:
  - Corre la suite de backend en Go: `go test ./pkg/... ./internal/...`
  - Corre la suite completa de frontend: `pnpm --dir frontend test`
  - Todos los tests deben pasar exitosamente. Queda terminantemente prohibido debilitar tests o usar `time.Sleep` injustificados para forzar que pasen.
- [ ] **Compilación local sin fallos**:
  - Verifica que el frontend compila correctamente: `pnpm --dir frontend build`
  - Verifica que el linter del frontend pasa sin errores: `pnpm --dir frontend lint`
  - Ejecuta una compilación de humo del ejecutable en Windows para asegurar que no hay errores de enlazado o dependencias ausentes.
- [ ] **Versión visible actualizada**:
  - Comprueba que la versión en `cmd/vantare/main.go` coincide con la versión objetivo (ej. `var version = "v0.3.10.0"`).
  - Comprueba que la versión en el manifiesto de Wails `build/config.yml` está sincronizada (ej. `version: "0.3.10.0"` bajo la sección `info`).
- [ ] **Changelog público actualizado**:
  - Revisa `docs/changelog.md`. Debe existir una sección dedicada a la versión que se va a publicar (ej. `## v0.3.10.0`) con la estructura de categorías: **Nuevo**, **Mejorado**, **Corregido** y **Para testers**.
  - Evita incluir terminología interna de desarrollo o referencias a refactors técnicos en esta sección; el contenido debe estar redactado en un lenguaje claro enfocado en el valor para el usuario final y los testers.
- [ ] **Incidencias conocidas (Known Issues) al día**:
  - Revisa `docs/tester-known-issues.md`. Asegúrate de que los problemas detectados en la fase de pruebas queden documentados de manera clara por orden de severidad (🔴 Bloqueantes, 🟡 Importantes, 🔵 Menores), junto con sus causas y soluciones provisionales.
- [ ] **Smoke Test manual**:
  - Antes de publicar la build, el desarrollador principal debe realizar una prueba manual mínima de 5 minutos abriendo la aplicación, entrando a Overlays Studio, editando un layout, abriendo el overlay con telemetría en modo Mock y cargando el overlay en un OBS local para garantizar que no hay regresiones críticas del flujo principal.

---

## 2. Checklist de Control de Versiones con Git

El etiquetado en Git es el desencadenante de la automatización de publicaciones en Discord. Sigue estas reglas estrictas para evitar tags rotos o commits fantasma:

### Flujo de Trabajo
1. **Confirmar Cambios de Versión**: Asegúrate de que el commit que actualiza la versión de la app y el changelog se realiza en la rama principal (`master` o `main`) con un mensaje claro (ej. `release: bump version to v0.3.10.0`).
2. **Push a Remoto**: Envía el commit al repositorio remoto antes de crear la etiqueta:
   ```bash
   git push origin master
   ```
3. **Crear Etiqueta Anotada**: Crea un tag local usando el prefijo `v` seguido del número de versión `X.X.X.X` (ej. `v0.3.10.0`):
   ```bash
   git tag -a v0.3.10.0 -m "Release v0.3.10.0"
   ```
4. **Push de la Etiqueta**: Envía el tag al repositorio remoto:
   ```bash
   git push origin v0.3.10.0
   ```

### Cuándo NO crear un tag de versión:
- **Cambios puramente documentales**: Si solo has actualizado guías, análisis de arquitectura, actas de reuniones o planes, **no** debes incrementar la versión ni crear una etiqueta. Estos cambios se comitean directamente en la rama principal con la categoría `docs:`.
- **Fallo en tests o build**: Si alguna verificación automatizada falla, corrige primero el problema antes de etiquetar. Nunca crees una etiqueta sobre un commit que no compila.

---

## 3. Automatización de GitHub Actions y Discord

Vantare Suite cuenta con 4 workflows en `.github/workflows/` para notificar a los testers en Discord. Estos flujos consumen webhooks específicos parametrizados en los secretos del repositorio.

| Workflow | Archivo | Desencadenante (Trigger) | Secreto Requerido | Canal de Discord Destino |
| :--- | :--- | :--- | :--- | :--- |
| **Release Announcement** | `discord-release.yml` | Al hacer push de un tag `v*` (o manual) | `DISCORD_RELEASE_WEBHOOK_URL` (o `DISCORD_WEBHOOK_URL`) | 📢 `#alpha-announcements` |
| **Beta Progress** | `discord-beta-progress.yml` | Al modificar `current-plan.md` o `roadmap-execution-board.md` | `DISCORD_PROGRESS_WEBHOOK_URL` (o `DISCORD_WEBHOOK_URL`) | 💡 `#alpha-feedback` |
| **Build Available** | `discord-build-available.yml` | Ejecución manual (`workflow_dispatch`) | `DISCORD_BUILD_WEBHOOK_URL` (o `DISCORD_WEBHOOK_URL`) | 💾 `#alpha-downloads` |
| **Known Issues** | `discord-known-issues.yml` | Al modificar `tester-known-issues.md` | `DISCORD_KNOWN_ISSUES_WEBHOOK_URL` (o `DISCORD_WEBHOOK_URL`) | 📌 `#alpha-known-issues` |

### Cómo disparar manualmente cada Workflow mediante GitHub CLI (`gh`):

1. **Anunciar una Release (Changelog)**:
   ```bash
   gh workflow run "Discord release announcement" --ref master -f tag=v0.3.10.0
   ```
2. **Publicar Progreso de la Beta**:
   ```bash
   gh workflow run "Discord beta progress" --ref master
   ```
3. **Anunciar una Build Disponible (Descarga)**:
   ```bash
   gh workflow run "Discord build available" --ref master -f version=v0.3.10.0 -f download_url="https://github.com/usuario/repo/releases/download/v0.3.10.0/vantare-amd64-installer.exe" -f sha256="HASH_SHA256_AQUÍ" -f notes="Prueba de Delta live en pista real"
   ```
4. **Sincronizar Incidencias Conocidas**:
   ```bash
   gh workflow run "Discord known issues" --ref master
   ```

---

## 4. Checklist de Empaquetado y Distribución de Builds

Para distribuir la versión a los testers de forma segura y profesional:

1. **Compilar el Paquete de Distribución**:
   - Genera el instalador de Windows (NSIS) y el ejecutable portable. Asegúrate de que la carpeta `configs/` que contiene los perfiles predeterminados se empaqueta junto al portable.
2. **Calcular el Hash de Verificación (SHA-256)**:
   - En la terminal de PowerShell del entorno de compilación, ejecuta:
     ```powershell
     Get-FileHash .\bin\vantare-amd64-installer.exe -Algorithm SHA256 | Format-List
     ```
   - Guarda el hash resultante (una cadena hexadecimal de 64 caracteres) para incluirlo en el anuncio de Discord. Esto permite a los testers verificar la integridad de su descarga.
3. **Subir los Archivos**:
   - Sube el instalador (`vantare-amd64-installer.exe`) y el archivo portable comprimido (`.zip`) a las Releases de GitHub o a un almacenamiento en la nube seguro (Google Drive, Dropbox, etc.).
4. **Publicar la build**:
   - Ejecuta el workflow de `Discord build available` (manualmente desde GitHub o usando el comando `gh` de la sección anterior) aportando la versión, el enlace de descarga obtenido y el hash SHA-256.

---

## 5. Procedimientos de Rollback (Gestión de Errores)

Si algo sale mal durante el proceso de lanzamiento, mantén la calma y sigue estos planes de contingencia estructurados:

### A. Si Discord no publica el anuncio de la versión
1. **Revisar Ejecución en GitHub**: Entra a la pestaña *Actions* de tu repositorio en GitHub y localiza la ejecución del workflow "Discord release announcement".
2. **Revisar Logs del Script**: Si el paso de Python falló con un mensaje de error:
   - *Error "Neither DISCORD_RELEASE_WEBHOOK_URL nor DISCORD_WEBHOOK_URL..."*: Los secretos no están definidos en GitHub. Ve a `Settings -> Secrets and variables -> Actions` en tu repositorio y configúralos.
   - *Error "Could not find changelog section for..."*: Comprueba que el nombre de la versión en el tag de Git coincide exactamente con el encabezado de segundo nivel (`## vX.X.X.X`) en `docs/changelog.md` (respetando espacios y minúsculas).
3. **Disparar Manualmente**: Corrige el error en el changelog en la rama master, haz push y vuelve a disparar el anuncio manualmente con el comando `gh workflow run` apuntando al tag deseado.

### B. Si el tag de Git apunta a un commit incorrecto o inestable
1. **Borrar el tag localmente**:
   ```bash
   git tag -d v0.3.10.0
   ```
2. **Borrar el tag en el servidor remoto**:
   ```bash
   git push origin --delete v0.3.10.0
   ```
3. **Re-etiquetar en el commit correcto**: Localiza el hash del commit estable (ej. `9699ac9`) y crea la etiqueta de nuevo sobre él:
   ```bash
   git tag -a v0.3.10.0 9699ac9 -m "Release v0.3.10.0"
   ```
4. **Pushear la nueva etiqueta**:
   ```bash
   git push origin v0.3.10.0
   ```

### C. Si se descubre un bug crítico en la build después de publicar el tag
1. **No reutilices la etiqueta**: Bajo ningún concepto re-apuntes un tag ya distribuido a un commit nuevo (esto corrompe la caché local de otros desarrolladores y testers).
2. **Corrige el error**: Realiza el commit corrector en `master` (ej. `fix: resolver regresión en delta live`).
3. **Incrementar parche (Patch bump)**: Haz un bump en la versión de la aplicación incrementando el último dígito del parche en `main.go` y `build/config.yml` (ej. de `v0.3.10.0` a `v0.3.10.1`).
4. **Etiquetar y publicar de nuevo**: Crea el tag `v0.3.10.1`, haz push y publica la nueva build siguiendo el flujo ordinario. Añade una nota explicativa en el changelog del parche (ej. `## v0.3.10.1 - Corrige bug crítico en delta`).

---

## 6. Plantillas Operativas

### A. Mensaje Corto Recomendado para Discord (Canal `#alpha-announcements`)

```text
📢 **¡Nueva Versión Disponible: Vantare v0.3.10.0!**

Hola a todos. Acabamos de publicar la versión **v0.3.10.0** de Vantare Suite para testers de la Beta Privada.

Esta versión introduce la primera base del módulo **Ingeniero** integrado directamente en el Hub y como widget de overlays, endurece el soporte de atajos de teclado globales y añade soporte Delta live real con Le Mans Ultimate.

Encontrará los enlaces de descarga y las instrucciones en el canal <#alpha-downloads>. Por favor, leed con atención la lista de <#alpha-known-issues> antes de comenzar a rodar.

¡Gracias por vuestro feedback! 🏁
```

### B. Formato Estándar de Entrada de Changelog (`docs/changelog.md`)

```markdown
## v0.3.10.0

**Nuevo**

- [Cambio relevante 1]
- [Cambio relevante 2]

**Mejorado**

- [Optimización o mejora de comportamiento]

**Corregido**

- [Solución a un bug con su síntoma]

**Para testers**

- [Instrucciones específicas para que los testers validen los cambios]
```
