# Runbook de Operaciones de Release y Beta Publica v0.1.0.0 (OPS1)

Documento operativo interno. Describe el procedimiento para llevar un cambio desde "feature terminada" hasta "build publicada para testers en Discord", minimizando errores de version, inconsistencias en el changelog, problemas con tags de Git y fallos en la ejecucion de los workflows automatizados.

> **Cambio de linea de versionado**: la linea publica es ahora `v0.1.0.0`. Las builds internas previas `v0.3.*` se mantienen como rastro historico **no anunciado**. No publiques tags `v0.3.*` en Discord ni en docs publicos; remiten a builds internas.

---

## 1. Checklist pre-release (puertas de calidad)

Antes de etiquetar una version y notificar a los testers en Discord:

- [ ] **Working tree limpio**: `git status --short` no debe mostrar cambios sin confirmar ajenos a la version.
- [ ] **Tests locales en verde**:
  - `go test ./pkg/... ./internal/...`
  - `pnpm --dir frontend test`
  - Todos los tests deben pasar. Queda prohibido debilitar tests para forzar verde.
- [ ] **Compilacion local sin fallos**:
  - `pnpm --dir frontend build`
  - `pnpm --dir frontend lint`
  - Build de humo del ejecutable Windows para detectar errores de enlazado o dependencias ausentes.
- [ ] **Version visible actualizada**:
  - `VERSION` (fuente unica de verdad) en la raiz debe coincidir con la version objetivo.
  - `cmd/vantare/main.go`, `build/config.yml`, `build/windows/info.json` y `build/windows/nsis/project.nsi` deben estar sincronizados via `build/sync_version.go` + `task version:sync`.
- [ ] **Changelog publico actualizado**:
  - `docs/changelog.md` debe tener una seccion `## v0.1.0.0` (o el parche correspondiente) con las categorias **Nuevo**, **Mejorado**, **Corregido** y **Para testers**.
  - Evita terminologia interna de desarrollo o referencias a refactors tecnicos.
- [ ] **Incidencias conocidas al dia**:
  - `docs/tester-known-issues.md` debe reflejar los problemas detectados en pruebas, ordenados por severidad.
- [ ] **Guia del tester revisada**:
  - `docs/tester-build-instructions.md` debe seguir siendo valida para la version (login, planes, SmartScreen, autoupdater).
- [ ] **Smoke test manual**:
  - El desarrollador principal debe abrir la app, entrar a Overlays Studio, editar un layout, abrir el overlay con datos Mock y cargarlo en OBS local para descartar regresiones criticas.

---

## 2. Control de versiones con Git

El etiquetado en Git es el desencadenante de la automatizacion de publicaciones en Discord.

### Flujo

1. **Confirmar cambios de version**: el commit que actualiza `VERSION` y el changelog va a `master` con mensaje claro (`release: bump version to v0.1.0.0`).
2. **Push a remoto**:
   ```bash
   git push origin master
   ```
3. **Crear etiqueta anotada** (prefijo `v` + 4 segmentos):
   ```bash
   git tag -a v0.1.0.0 -m "Release v0.1.0.0"
   ```
4. **Push de la etiqueta**:
   ```bash
   git push origin v0.1.0.0
   ```

### Cuando NO crear un tag

- **Cambios puramente documentales**: si solo actualizas guias, analisis o planes, no incrementes la version. Comitea con la categoria `docs:` directamente en `master`.
- **Fallo en tests o build**: si alguna verificacion automatizada falla, corrigelo antes de etiquetar.

### Politica de rebase de tags

- **Nunca re-apuntes un tag distribuido** a un commit distinto. Esto corrompe la cache local de testers y del updater.
- Si descubres un bug critico post-tag, incrementa el parche (`v0.1.0.1`, `v0.1.0.2`) y publica una nueva build.

---

## 3. Automatizacion de GitHub Actions y Discord

Vantare cuenta con workflows en `.github/workflows/` que publican anuncios en Discord. Los webhooks especificos viven en secretos del repositorio.

| Workflow | Trigger | Secreto | Canal Discord |
|----------|---------|---------|---------------|
| Release announcement | push tag `v*` o manual | `DISCORD_RELEASE_WEBHOOK_URL` | `#beta-announcements` |
| Tester progress | fragmento `docs/changelog/fragments/*.json` que alcanza `develop` | `DISCORD_PROGRESS_WEBHOOK_URL` | testers (`1519752249977340168`) |
| Public beta changelog | manual (`workflow_dispatch`) | `DISCORD_BUILD_WEBHOOK_URL` | beta pública (`1519747444315914512`) |
| Active development | diario o manual, desde proyectos Linear con opt-in | `DISCORD_KNOWN_ISSUES_WEBHOOK_URL` | desarrollo-vantare (`1519752544753291305`) |

> Los canales exactos (`#beta-*`) son los publicos de la Beta Publica. Las builds internas previas (`v0.3.*`) que pudieran haber quedado apuntando a `#alpha-*` no se usan ya para esta linea.

### Disparar manualmente con `gh`

```bash
# Anunciar una release (changelog)
gh workflow run "Discord release announcement" --ref master -f tag=v0.1.0.0

# Publicar progreso
gh workflow run "Discord tester progress" --ref develop -f base_revision=HEAD^

# Anunciar build disponible (automatica desde release)
gh workflow run "Discord public beta changelog" --ref master \
  -f version=v0.1.0.0 \
  -f release_tag=v0.1.0.0 \
  -f notes="Notas opcionales para testers"

# Anunciar build disponible (manual con URL externa)
gh workflow run "Discord public beta changelog" --ref master \
  -f version=v0.1.0.0 \
  -f download_url="https://github.com/usuario/repo/releases/download/v0.1.0.0/vantare-amd64-installer.exe" \
  -f sha256="HASH_SHA256_AQUI" \
  -f notes="Notas opcionales"

# Publicar el digest aprobado de proyectos activos
gh workflow run "Discord active development" --ref refactor
```

### Re-run seguro

Todos los workflows de Discord detectan `github.run_attempt > 1` y se saltan el envio con `::warning::`. Para re-publicar un mensaje:

- Opcion recomendada: dispara un nuevo `workflow_dispatch` desde la UI o con `gh workflow run`.
- Opcion de emergencia: re-run failed jobs. Advertira que se salta el envio.

### Separacion de triggers

`Discord tester progress` solo escucha fragmentos en `develop`; `Discord active development` solo se ejecuta por horario o dispatch; y el changelog beta solo por dispatch. Un tag no puede activar ninguna de esas tres vías.

---

## 4. Empaquetado y distribucion de builds

> **R03.B**: la generacion de artefactos esta automatizada con `wails3 task release:artifacts` (alias de `windows:package:all` y `package:all`). Encadena `version:sync` -> `windows:build` -> instalador NSIS -> portable zip -> SHA256 sidecars -> verify de version. Detalle tecnico en `docs/release-artifacts.md`.
>
> **R03.C**: `.github/workflows/release.yml` ejecuta el mismo pipeline en GitHub Actions y, sobre tags `v*`, crea la Release con los assets automaticamente.

### Opcion A: build local (validacion previa al tag)

1. Asegurar que la build local tiene las variables publicas de Supabase para frontend y backend Go.
   En local, `frontend\.env.local` suele contener `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; el binario Go necesita las equivalentes `VANTARE_SUPABASE_URL` y `VANTARE_SUPABASE_ANON_KEY` durante el build.

   ```powershell
   $envFile = Get-Content frontend\.env.local | Where-Object { $_ -match '^\s*VITE_SUPABASE_' }
   foreach ($line in $envFile) {
     $parts = $line -split '=', 2
     if ($parts.Count -eq 2) {
       if ($parts[0].Trim() -eq 'VITE_SUPABASE_URL') { $env:VANTARE_SUPABASE_URL = $parts[1].Trim() }
       if ($parts[0].Trim() -eq 'VITE_SUPABASE_ANON_KEY') { $env:VANTARE_SUPABASE_ANON_KEY = $parts[1].Trim() }
     }
   }
   if (-not $env:VANTARE_SUPABASE_URL -or -not $env:VANTARE_SUPABASE_ANON_KEY) {
     throw 'Missing Supabase vars in frontend\.env.local'
   }
   ```

2. Generar los artefactos oficiales desde `vantare-v2/`:
   ```powershell
   wails3 task release:clean
   wails3 task release:artifacts
   ```
   Produce:
   - `bin\vantare-amd64-installer.exe`
   - `bin\vantare-portable-amd64.zip`
   - `bin\vantare.exe`
   - Sus 3 sidecars `*.sha256`.
   El paso `verify` confirma que la cadena de version correcta esta embebida. Si falla, no publiques.

3. Abrir la app para smoke manual:
   ```powershell
   Start-Process -FilePath .\bin\vantare.exe -WorkingDirectory .\bin
   ```

   Verificacion rapida del servidor local:
   ```powershell
   Invoke-WebRequest http://127.0.0.1:39261/health -UseBasicParsing
   ```
   Debe devolver `{"ok":true}`.

### Smoke del icono de la app (Windows)

El icono que se ve en taskbar, ventana e instalador NSIS sale de `build\windows\icon.ico`, que `release:artifacts` incrusta en `bin\vantare.exe` y en el instalador via `wails3 generate syso`. **El build rapido de la opcion A2 (`go build` directo) NO genera ni incrusta `wails_windows_amd64.syso`, asi que su binario conserva el icono anterior aunque el `.ico` se haya regenerado**. Para validar branding real:

1. Regenerar el icono solo cuando cambie el logo fuente (`build\appicon.png`):
   ```powershell
   cd build
   wails3 generate icons -input appicon.png -macfilename darwin\icons.icns -windowsfilename windows\icon.ico -iconcomposerinput appicon.icon -macassetdir darwin
   cd ..
   ```
   El `.ico` resultante es multi-tamano (16, 32, 48, 64, 128, 256) a 32 bpp. El comando tambien regenera `build\darwin\icons.icns` y `build\appicon.icon\Assets\wails_icon_vector.svg`; **no commitear** cambios en `darwin\icons.icns` ni en `appicon.icon\**` si el alcance es Windows-only — restaurar con `git checkout -- build/darwin/icons.icns build/appicon.icon/`.

2. Smoke de icono con el pipeline oficial (unico que incrusta `.syso`):
   ```powershell
   wails3 task release:clean
   wails3 task release:artifacts
   wails3 task release:verify
   ```
   Inspeccionar el `.exe`:
   ```powershell
   magick identify .\bin\vantare.exe
   ```
   Debe listar los tamanos del icono (16..256). Alternativa sin ImageMagick: inspeccionar la seccion `.rsrc` del PE con cualquier editor de recursos.

3. Smoke visual minimo: instalar el artefacto (`.\bin\vantare-amd64-installer.exe`), abrir el `.exe` desde el menu Inicio y confirmar que el icono de taskbar/ventana es el logo Vantare y no el icono Wails por defecto. Si Windows sigue mostrando el icono anterior, ver la nota sobre cache de iconos abajo.

#### Cache de iconos en Windows

Windows cachea iconos de `.exe` por ruta y hash. Aunque el binario cambie, el shell puede seguir mostrando el icono antiguo hasta que se libere la cache. Procedimiento recomendado, de menor a mayor impacto:

- Reinstalar encima (`vantare-amd64-installer.exe` por encima de la build anterior) suele bastar.
- Si no basta, cerrar la app y forzar refresco: `ie4uinit.exe -show` (Windows 10/11).
- Como ultimo recurso, cerrar la app, parar `explorer.exe` desde el administrador de tareas, borrar `%LocalAppData%\IconCache.db` y volver a iniciar `explorer.exe`. **No** hacerlo si hay otros Vantare/binarios en uso.

### Opcion A2: build rapido de smoke local, no publicable

Usar solo para probar cambios locales en la app cuando no necesitas installer/zip. Esta ruta genera `bin\vantare.exe` con Supabase embebido, pero **no** produce los 6 artefactos oficiales ni checksums.

1. Recompilar frontend con la version de pnpm del repo:
   ```powershell
   corepack pnpm --dir frontend build
   ```

2. Mapear `.env.local`, generar `supabase_build.go`, compilar y limpiar el archivo temporal:
   ```powershell
   $envFile = Get-Content frontend\.env.local | Where-Object { $_ -match '^\s*VITE_SUPABASE_' }
   foreach ($line in $envFile) {
     $parts = $line -split '=', 2
     if ($parts.Count -eq 2) {
       if ($parts[0].Trim() -eq 'VITE_SUPABASE_URL') { $env:VANTARE_SUPABASE_URL = $parts[1].Trim() }
       if ($parts[0].Trim() -eq 'VITE_SUPABASE_ANON_KEY') { $env:VANTARE_SUPABASE_ANON_KEY = $parts[1].Trim() }
     }
   }
   if (-not $env:VANTARE_SUPABASE_URL -or -not $env:VANTARE_SUPABASE_ANON_KEY) {
     throw 'Missing Supabase vars in frontend\.env.local'
   }

   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\generate_supabase_config.ps1 -OutFile .\cmd\vantare\supabase_build.go
   try {
     go build -tags production -trimpath -buildvcs=false -ldflags "-w -s -H windowsgui -X main.version=v$(Get-Content VERSION)" -o .\bin\vantare.exe .\cmd\vantare
   } finally {
     Remove-Item .\cmd\vantare\supabase_build.go -ErrorAction SilentlyContinue
   }
   ```

3. Abrir la app:
   ```powershell
   Start-Process -FilePath .\bin\vantare.exe -WorkingDirectory .\bin
   ```

Si aparece `Configuracion incompleta`, casi siempre se esta ejecutando un binario stale o se compilo sin `VANTARE_SUPABASE_*`. Cierra la app, reconstruye con los pasos anteriores y confirma que no estas abriendo `vantare.exe` en la raiz del repo ni un portable antiguo.

### Opcion B: build desde GitHub Actions (oficial)

1. Pushea el tag:
   ```bash
   git tag -a v0.1.0.0 -m "Release v0.1.0.0"
   git push origin v0.1.0.0
   ```
2. El workflow `Release build` se dispara automaticamente, genera los 6 artefactos y crea la GitHub Release con los assets.

### Recoger el SHA256 para el anuncio de Discord

- Desde CI: descarga el `.sha256` desde la Release de GitHub.
- Desde build local: lee `bin\vantare-amd64-installer.exe.sha256`.

### Publicar la build

Ejecuta `Discord public beta changelog` aportando versión, enlace y SHA256. `Discord release announcement` se dispara al pushear el tag `v*` y comprueba que su commit pertenece a `master`.

---

## 5. Procedimientos de rollback

### A. Si Discord no publica el anuncio

1. Revisa la ejecucion del workflow en la pestana **Actions**.
2. Si falta el secreto dedicado, configura exactamente el `DISCORD_*_WEBHOOK_URL` indicado en `docs/discord-communications.md`; no existe fallback genérico.
3. Si fallo por `Could not find changelog section for...`, verifica que el tag coincide exactamente con el encabezado `## vX.X.X.X` de `docs/changelog.md`.
4. Corrige y vuelve a disparar con `gh workflow run`.

### B. Si el tag apunta a un commit incorrecto

```bash
git tag -d v0.1.0.0
git push origin --delete v0.1.0.0
git tag -a v0.1.0.0 <commit_hash> -m "Release v0.1.0.0"
git push origin v0.1.0.0
```

### C. Si se descubre un bug critico post-tag

1. No reutilices la etiqueta.
2. Commitea el fix en `master`.
3. Incrementa el cuarto segmento del parche (`v0.1.0.0` -> `v0.1.0.1`).
4. Etiqueta y publica la nueva build siguiendo el flujo ordinario.
5. Documenta el fix en `docs/changelog.md` bajo la nueva version.

### D. Troubleshooting especifico de Discord

| Sintoma | Causa probable | Solucion |
|---------|----------------|----------|
| `dedicated Discord webhook secret is required` | No hay webhook dedicado configurado | Configura el secreto correspondiente; no uses un fallback genérico. |
| `Discord webhook rejected the request (403)` | URL invalida o token cambiado | Verifica el webhook y actualiza el secreto. |
| `Discord rate limited (429). Retrying after Ns...` | Muchos mensajes seguidos | El workflow reintenta; si persiste, espera minutos. |
| `Could not fetch GitHub Release vX.Y.Z` | El tag no existe o falta `GITHUB_TOKEN` | Confirma con `gh release view`. |
| `Release vX.Y.Z does not contain asset vantare-amd64-installer.exe` | La release no tiene los 6 assets | Revisa `Release build`. |
| `Changelog section for vX.Y.Z is empty` | Encabezado sin contenido | Anade al menos una linea bajo `## vX.Y.Z`. |
| Mensaje duplicado en Discord | Rerun o fragmento repetido | Los reruns se omiten y los fragmentos se comparan semánticamente con la revisión base. |

---

## 6. Plantillas operativas

### A. Mensaje corto para `#beta-announcements`

```text
Nueva version disponible: Vantare v0.1.0.0

Hola a todos. Acabamos de publicar la version v0.1.0.0 de Vantare Suite para la Beta Publica.

Esta build incluye login obligatorio con Google, planes free / paid / suite, Overlays Studio completo (Relative, Standings, Pedals, Delta, Ingeniero), Ingeniero con notificaciones en overlay, telemetria live de Le Mans Ultimate, hotkeys globales, autoupdater verificado y soporte OBS local.

Encontraras los enlaces de descarga y los checksums SHA256 en #beta-downloads. Por favor, lee con atencion la lista de #beta-known-issues antes de comenzar.

Aviso de SmartScreen: los ejecutables no tienen firma digital. Pulsa "Mas informacion" -> "Ejecutar de todas formas". Verifica el SHA256 para asegurar la integridad de tu descarga.

Gracias por vuestro feedback.
```

### B. Formato estandar de entrada de changelog

```markdown
## v0.1.0.0

**Nuevo**

- [Cambio relevante 1]
- [Cambio relevante 2]

**Mejorado**

- [Optimizacion o mejora de comportamiento]

**Corregido**

- [Solucion a un bug con su sintoma]

**Para testers**

- [Instrucciones especificas para validar los cambios]
```

---

## 7. Cambios respecto a la linea `v0.3.*` (interno)

- La linea publica pasa a `v0.1.x`. El cuarto segmento queda reservado para hotfixes (`v0.1.0.1`, `v0.1.0.2`).
- Las builds `v0.3.*` previas son internas y **no se anuncian al publico**.
- Los canales de Discord publicos pasan a `#beta-*`. Los `#alpha-*` quedan como rastro historico interno.
- El updater debe apuntar a la nueva linea. Si quedan caches apuntando a tags `v0.3.*`, dejaran de recibir updates; forzar manualmente la actualizacion a `v0.1.0.0` desde `#beta-downloads`.
## Soporte de licencias y pagos

Usa el CLI `vantare-admin` (compilado con `go build -o vantare-admin ./cmd/vantare-admin`) y los dashboards externos según el escenario.

### Prerrequisitos

```powershell
$env:SUPABASE_URL = "<url>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
```

### Escenario 1: Usuario pagó pero la app muestra Free

**Síntomas:** El usuario reporta que hizo el pago en Stripe pero la app sigue en Free.

**Diagnóstico:**

```bash
./vantare-admin lookup <email>
```

Verificar que `user_entitlements` tiene fila con `status: active` para el product_key correcto.

**Causas posibles:**
1. **Webhook no procesado** — Revisar logs de la EF: `supabase functions logs stripe-webhook --project-ref <ref>`.
2. **El RPC get_account_entitlements no devuelve entitlement** — Verificar en Supabase SQL Editor: `select * from get_account_entitlements('<fingerprint>');`.
3. **Device-limit** — `./vantare-admin device-reset <email>`.

**Resolución de emergencia:** `./vantare-admin grant <email> <product_key>`.

### Escenario 2: Usuario atrapado en device-limit

**Síntomas:** La app muestra "Límite de dispositivos".

**Diagnóstico:** `./vantare-admin lookup <email>`. Verificar `active_device` != fingerprint del usuario.

**Resolución:** `./vantare-admin device-reset <email>`. Esto limpia `devices.fingerprint_hash` y `devices.last_reset_at`. El usuario debe reiniciar la app.

### Escenario 3: Reembolso o cancelación

**Reembolso:** Stripe Dashboard → Payments → Refund. Stripe emite `charge.refunded` (no manejado por la EF). Revocar manualmente: `./vantare-admin revoke <email> <product_key>`.

**Cancelación de suscripción:** Stripe Dashboard → Customers → Subscriptions → Cancelar. Stripe emite `customer.subscription.deleted` → la EF lo procesa y marca `status = 'expired'`. Verificar: `select * from user_entitlements where user_id = '<id>'`. Si no se procesó, revocar manualmente con el CLI.

### Logs y auditoría

```bash
./vantare-admin events <email>
supabase functions logs stripe-webhook --project-ref <ref>
```
