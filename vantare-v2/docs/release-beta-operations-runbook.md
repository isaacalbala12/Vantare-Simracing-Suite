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
   - Se dispara automáticamente al pushear un tag `v*`.
   - Si repites la ejecución (`re-run`), el workflow se salta el envío para evitar duplicados.
2. **Publicar Progreso de la Beta**:
   ```bash
   gh workflow run "Discord beta progress" --ref master
   ```
   - Se dispara automáticamente al modificar `vantare-v2/docs/current-plan.md` o `vantare-v2/docs/roadmap-execution-board.md`.
3. **Anunciar una Build Disponible (Descarga)**:

   Opción A — automática a partir de una GitHub Release (recomendado):
   ```bash
   gh workflow run "Discord build available" --ref master \
     -f version=v0.3.10.0 \
     -f release_tag=v0.3.10.0 \
     -f notes="Prueba de Delta live en pista real"
   ```
   - El workflow extrae `download_url` y `sha256` de los assets de la release.
   - Si quieres anular algún valor automático, añade `-f download_url=...` o `-f sha256=...`.

   Opción B — manual (fallback si no hay release o quieres un enlace externo):
   ```bash
   gh workflow run "Discord build available" --ref master \
     -f version=v0.3.10.0 \
     -f download_url="https://github.com/usuario/repo/releases/download/v0.3.10.0/vantare-amd64-installer.exe" \
     -f sha256="HASH_SHA256_AQUÍ" \
     -f notes="Prueba de Delta live en pista real"
   ```
4. **Sincronizar Incidencias Conocidas**:
   ```bash
   gh workflow run "Discord known issues" --ref master
   ```
   - Se dispara automáticamente al modificar `vantare-v2/docs/tester-known-issues.md`.

### Re-run seguro

Todos los workflows de Discord ahora detectan `github.run_attempt > 1` y se salta el envío con un `::warning::`. Si necesitas re-publicar un mensaje:

- **Opción recomendada:** dispara un nuevo `workflow_dispatch` desde la UI de GitHub o con `gh workflow run`.
- **Opción de emergencia:** ve a la ejecución anterior en GitHub Actions, ábrela y ejecuta `Re-run failed jobs`. El workflow advertirá que se salta el envío; no volverá a publicar.
- Si realmente necesitas enviar el mismo mensaje de nuevo, cambia levemente el input (por ejemplo, añade una nota) o elimina la ejecución anterior para que `run_attempt` vuelva a ser 1.

### Tag-guard para workflows de Discord no-release (R03.H)

Los workflows `Discord beta progress` y `Discord known issues` **no deben dispararse cuando el push es de un tag**. Su trigger normal es por `push` filtrado por `paths`, pero un push de tag activa el evento `push` aunque los `paths` no coincidan, y eso generaba mensajes colaterales al publicar una release.

- A partir de R03.H, ambos workflows llevan un guard a nivel de job (`if: github.ref_type != 'tag'`) más un step explicativo (`::notice::`) que anuncia el salto. Si el trigger es un tag, el workflow se salta el envío y termina en verde sin postear nada a Discord.
- El workflow `Discord release announcement` (que es el del release) sigue disparándose normalmente con `push: tags: v*` y con `workflow_dispatch`.
- El workflow `Discord build available` solo se dispara por `workflow_dispatch` (no tiene `push`), por lo que no le afecta el guard.

### Política: no crear GitHub Release por cada commit

- **No se publica una release por cada commit a `master`.** Los commits se acumulan y el tag se publica cuando hay una versión coherente con `VERSION`, `changelog.md` y los gates locales (tests, lint, build, smoke manual).
- Una GitHub Release solo se crea cuando hay un tag `v*` legítimo que cumple el checklist del runbook.
- `release.yml` se ejecuta solo en `push: tags: v*` (crea release) o en `workflow_dispatch` con `create_release: true` sobre un tag (re-crea/actualiza). Un `workflow_dispatch` sobre `master` solo genera los artefactos como GitHub Actions artifact y no toca GitHub Releases.
- **Para el tester:** esto significa que las builds de desarrollo diarias no se distribuyen. Solo recibiran notificaciones cuando haya una version validada y etiquetada. Las actualizaciones frecuentes se entregan via autoupdater, no via commits individuales.

### `release.yml` idempotente (R03.H)

El job `release` detecta si la GitHub Release del tag ya existe:

- Si **no existe**: ejecuta `gh release create "$TAG" --title "Vantare $TAG" --notes-file changelog_body.md` enumerando los 6 assets oficiales (sin glob amplio). Falla con `::error::` si falta cualquiera de los 6.
- Si **ya existe**: ejecuta `gh release edit "$TAG" --title ... --notes-file changelog_body.md` y luego `gh release upload "$TAG" <asset> --clobber` por cada uno de los 6 assets. `--clobber` borra el asset previo del mismo nombre antes de subir el nuevo; si el upload falla, los originales se pierden (esto es comportamiento documentado de `gh`).
- Verificación final: `gh release view "$TAG" --json tagName,name,assets --jq ...` imprime el número de assets para confirmar el estado.

Con esto, un re-run del workflow sobre un tag ya publicado pasa a verde sin intervención manual.

### Releases históricas y firma de código

- **Releases históricas sin `.sha256`**: las GitHub Releases publicadas antes de R03.B no incluyen el sidecar `*.sha256`. El updater detecta el checksum ausente y cae al flujo de descarga sin verificación (degradación aceptable para tags legacy). Esto se documenta como TD-028. Si necesitas verificar integridad de un binario histórico, debes usar el hash publicado en Discord o calcularlo manualmente con `Get-FileHash`/`certutil -hashfile`.
- **Beta privada sin firma de código**: la beta distribuye binarios sin firma Authenticode. Windows SmartScreen mostrará el aviso "App desconocida"; los testers ya están informados (el mensaje de `discord-build-available.yml` lo recuerda) y deben hacer clic en "More info" -> "Run anyway". Es un trade-off explícito para acelerar feedback.
- **Release público requiere Authenticode**: antes del primer release público (R15 RC o equivalente) hay que firmar tanto `vantare.exe` como `vantare-amd64-installer.exe` con un certificado Authenticode válido. Ver TD-027. Sin firma, los usuarios finales no podrán ejecutar el binario sin pasos manuales y la reputación de SmartScreen queda dañada.

---

## 4. Checklist de Empaquetado y Distribución de Builds

Para distribuir la versión a los testers de forma segura y profesional:

> **R03.B:** la generación de artefactos está automatizada. Ejecuta una sola tarea y obtienes los archivos oficiales con sus checksums. Ver `docs/release-artifacts.md` para el detalle técnico.
> **R03.C:** el workflow `.github/workflows/release.yml` ejecuta el mismo pipeline en GitHub Actions y, en tags `v*`, crea la Release con los assets automáticamente.

### Opción A: build local (para validación previa al tag)

1. **Generar los Artefactos Oficiales**:
   - En la raíz de `vantare-v2/`, ejecuta:
     ```powershell
     wails3 task release:clean        # elimina archivos obsoletos de bin/
     wails3 task release:artifacts    # build + installer + portable + SHA256 + verify
     ```
   - El comando produce automáticamente:
     - `bin\vantare-amd64-installer.exe` (instalador NSIS)
     - `bin\vantare-portable-amd64.zip` (zip portable con `configs/*.json` + `docs/README.txt`)
     - `bin\vantare.exe` (binario base, ~13 MB)
     - `bin\vantare-amd64-installer.exe.sha256`, `bin\vantare-portable-amd64.zip.sha256`, `bin\vantare.exe.sha256`
   - El paso `verify` confirma que el binario y el installer contienen la cadena de versión correcta y falla con código de salida distinto de 0 si no la encuentra. Si falla, NO publiques.

### Opción B: build desde GitHub Actions (oficial para testers)

1. **Pushea el tag**:
   ```bash
   git tag -a v0.3.10.0 -m "Release v0.3.10.0"
   git push origin v0.3.10.0
   ```
2. El workflow `Release build` se dispara automaticamente, genera los 6 artefactos y crea la GitHub Release con los assets.
3. Si no quieres crear una release (por ejemplo, para probar el build), usa `workflow_dispatch` en una rama o en un tag sin marcar `create_release`.

### Recoger el Hash SHA-256 para el Anuncio de Discord

- Si usaste CI, descarga el `.sha256` desde la Release de GitHub o desde el artifact del workflow.
- Si hiciste build local, el pipeline ya escribió los checksums en `bin\*.sha256`. Lee el del installer:
  ```powershell
  Get-Content .\bin\vantare-amd64-installer.exe.sha256
  ```
- Copia el valor hexadecimal (64 caracteres) para incluirlo en el anuncio. Esto permite a los testers verificar la integridad de su descarga con `certutil.exe -hashfile` o `Get-FileHash`.

### Subir los Archivos

- En CI, los assets ya se suben a la Release de GitHub automaticamente. Mantener los nombres exactos es importante: el autoupdater (`internal/updater/github.go`) busca el asset `vantare-amd64-installer.exe` y su `*.sha256` por nombre literal.
- Si haces distribucion manual, sube el instalador, el portable zip y los 3 checksums `.sha256` a un almacenamiento seguro.

### Publicar la build

- Ejecuta el workflow de `Discord build available` (manualmente desde GitHub o usando el comando `gh` de la sección anterior) aportando la versión, el enlace de descarga obtenido de la Release de GitHub y el hash SHA-256.
- El workflow `Discord release announcement` ya se disparó automaticamente al pushear el tag `v*`.

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

### D. Troubleshooting específico de Discord

| Síntoma | Causa probable | Solución |
| :--- | :--- | :--- |
| `Neither DISCORD_*_WEBHOOK_URL nor DISCORD_WEBHOOK_URL secret is configured` | No hay webhook configurado en GitHub Secrets. | Ve a `Settings → Secrets and variables → Actions` y añade el secreto correspondiente (o el fallback `DISCORD_WEBHOOK_URL`). |
| `Discord webhook rejected the request (403)` | La URL del webhook es inválida, fue eliminada o el token cambió. | Verifica la URL en Discord Server Settings → Integrations → Webhooks y actualiza el secreto. Nunca pongas la URL en el código. |
| `Discord rate limited (429). Retrying after Ns...` | Se enviaron demasiados mensajes seguidos. | El workflow reintenta automáticamente una vez. Si persiste, espera unos minutos y vuelve a disparar. |
| `Could not fetch GitHub Release vX.Y.Z` | El tag no existe o `GITHUB_TOKEN` no tiene permisos. | Confirma el tag con `gh release view vX.Y.Z`. En forks privados, asegúrate de que `permissions: contents: read` esté presente. |
| `Release vX.Y.Z does not contain asset vantare-amd64-installer.exe` | La release no tiene los artefactos esperados. | Revisa que `Release build` terminó correctamente y subió los 6 archivos oficiales. |
| `Changelog section for vX.Y.Z is empty` | Existe el encabezado en `changelog.md` pero no tiene contenido. | Añade al menos una línea bajo el encabezado `## vX.Y.Z`. |
| Mensaje duplicado en Discord | Se hizo `re-run` sin el mecanismo de idempotencia. | Los workflows actuales se saltan el envío en `run_attempt > 1`. Si ves un duplicado, revisa si el workflow es una versión antigua. |

---

## 6. Plantillas Operativas

### A. Mensaje Corto Recomendado para Discord (Canal `#beta-announcements`)

```text
📢 **¡Nueva Versión Disponible: Vantare v0.3.10.0!**

Hola a todos. Acabamos de publicar la versión **v0.3.10.0** de Vantare Suite para la Beta Abierta.

Esta versión incluye Overlays Studio completo (Relative, Standings, Pedals configurables), el módulo Ingeniero con notificaciones en overlay, telemetría live con Le Mans Ultimate, hotkeys globales, autoupdater y soporte OBS local.

Encontrarás los enlaces de descarga y los checksums SHA256 en el canal <#beta-downloads>. Por favor, lee con atención la lista de <#beta-known-issues> antes de comenzar.

⚠️ **SmartScreen**: Los ejecutables no tienen firma digital. Haz clic en "Más información" → "Ejecutar de todas formas". Verifica el checksum SHA256 para asegurar la integridad de tu descarga.

¡Gracias por vuestro feedback!
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
