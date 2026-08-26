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

1. **Confirmar cambios de versión**: el commit que actualiza `VERSION` y el
   changelog se prepara en `testers` y se incluye en el PR final
   `testers -> master`.
2. **Validación final de Isaac**: solo después de su aprobación se integra ese
   PR en `master`. No se permite push directo.
3. **Crear etiqueta anotada desde el commit ya integrado en `master`**
   (prefijo `v` + 4 segmentos):
   ```bash
   git tag -a v0.1.0.0 -m "Release v0.1.0.0"
   ```
4. **Push de la etiqueta**:
   ```bash
   git push origin v0.1.0.0
   ```

### Cuando NO crear un tag

- **Cambios puramente documentales**: si solo actualizas guías, análisis o
  planes, no incrementes la versión, pero utiliza igualmente una rama de issue
  y la ruta completa de promoción. Nunca comitees directamente en `master`.
- **Fallo en tests o build**: si alguna verificacion automatizada falla, corrigelo antes de etiquetar.

### Politica de rebase de tags

- **Nunca re-apuntes un tag distribuido** a un commit distinto. Esto corrompe la cache local de testers y del updater.
- Si descubres un bug critico post-tag, incrementa el parche (`v0.1.0.1`, `v0.1.0.2`) y publica una nueva build.

---

## 3. Automatizacion de GitHub Actions y Discord

Vantare cuenta con workflows en `.github/workflows/` que publican anuncios en Discord. Los webhooks especificos viven en secretos del repositorio.

| Workflow | Trigger | Secreto | Canal Discord |
|----------|---------|---------|---------------|
| Release estable | tag `v*` verificado en `master`, tras subir artefactos | `DISCORD_RELEASE_WEBHOOK_URL` | canal de lanzamientos configurado |
| Nightly/Testers | pre-release verificada desde la rama homónima | `DISCORD_PROGRESS_WEBHOOK_URL` | testers (`1519752249977340168`) |
| Changelog | después de publicar la misma pre-release | `DISCORD_BUILD_WEBHOOK_URL` | changelog (`1519747444315914512`) |
| Desarrollo activo | diario o manual, desde proyectos Linear con opt-in | `DISCORD_KNOWN_ISSUES_WEBHOOK_URL` | desarrollo-vantare (`1519752544753291305`) |

> Los canales exactos (`#beta-*`) son los publicos de la Beta Publica. Las builds internas previas (`v0.3.*`) que pudieran haber quedado apuntando a `#alpha-*` no se usan ya para esta linea.

### Disparar manualmente con `gh`

```bash
# Publicar una Nightly verificada con EXE, instalador, portable y checksums
gh workflow run "Release build" --ref nightly \
  -f publish_channel=nightly \
  -f release_tag=v0.1.0.5-nightly.1 \
  -f release_notes="Primera validación privada de Overlay Studio"

# Generar únicamente una build interna, sin GitHub pre-release ni Discord
gh workflow run "Release build" --ref nightly -f publish_channel=none

# Publicar el digest aprobado de proyectos activos
gh workflow run "Discord active development v2" --ref master
```

### Re-run seguro

Todos los workflows de Discord detectan `github.run_attempt > 1` y se saltan el envio con `::warning::`. Para re-publicar un mensaje:

- Opcion recomendada: dispara un nuevo `workflow_dispatch` desde la UI o con `gh workflow run`.
- Opcion de emergencia: re-run failed jobs. Advertira que se salta el envio.

### Separacion de triggers

La publicación de Nightly/Testers y su changelog forma parte del mismo workflow
que construye y verifica la pre-release. Por ello nunca se anuncia una descarga
antes de que existan sus seis artefactos. Desarrollo activo es independiente y
solo se ejecuta por horario o dispatch desde la rama predeterminada.

La ruta de promoción es `rama de issue -> nightly -> testers -> master`.
`develop` permanece congelada como referencia histórica. Consulta
`docs/branch-channels.md` antes de crear una build o promover un conjunto.

---

## 4. Empaquetado y distribucion de builds

> **R03.B**: la generacion de artefactos esta automatizada con `wails3 task release:artifacts` (alias de `windows:package:all` y `package:all`). Encadena preflight de configuracion -> `version:sync` -> `windows:build` -> instalador NSIS -> portable zip -> SHA256 sidecars -> verify de version. La receta unica vive en `docs/release-artifacts.md`.
>
> **R03.C**: `.github/workflows/release.yml` ejecuta el mismo pipeline en GitHub Actions y, sobre tags `v*`, crea la Release con los assets automaticamente.

### Opcion A: build local (validacion previa al tag)

Sigue de principio a fin la receta unica de
`docs/release-artifacts.md`, seccion 2. Alli viven la carga autorizada de
`.env.local` sin copiarlo ni imprimirlo, el mapeo Task/frontend/Go, el uso de
`-f`, el preflight, los comandos y el smoke obligatorio de Google OAuth. Este
runbook no mantiene una segunda receta.

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
   ejecuta primero la receta de `docs/release-artifacts.md`, seccion 2.2, en
   la misma consola autorizada.
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

Usar solo para desarrollo local cuando no hacen falta installer, portable ni
checksums. Un `pnpm build`, `go build`, `wails3 task build` o empaquetado de un
exe preconstruido **no es publicable**. Las diferencias de nombres de entorno
y el procedimiento para reconstruir con `-f` se mantienen exclusivamente en
`docs/release-artifacts.md`; si el resultado se va a distribuir, vuelve a la
opcion A.

### Opcion B: build desde GitHub Actions (oficial)

1. Pushea el tag:
   ```bash
   git tag -a v0.1.0.0 -m "Release v0.1.0.0"
   git push origin v0.1.0.0
   ```
2. El workflow `Release build` se dispara automaticamente, genera los 6 artefactos, crea la GitHub Release con los assets y solo entonces publica sus dos mensajes de Discord.

### Recoger el SHA256 para el anuncio de Discord

- Desde CI: descarga el `.sha256` desde la Release de GitHub.
- Desde build local: lee `bin\vantare-amd64-installer.exe.sha256`.

### Publicar la build

No existe un anuncio separado. `Release build` obtiene el enlace y SHA256 de los artefactos verificados y publica Changelog junto con la tarjeta del canal. Para Stable, el tag `v*` debe pertenecer a `master`.

---

## 5. Procedimientos de rollback

### A. Si Discord no publica el anuncio

1. Revisa la ejecucion del workflow en la pestana **Actions**.
2. Si falta el secreto dedicado, configura exactamente el `DISCORD_*_WEBHOOK_URL` indicado en `docs/discord-communications.md`; no existe fallback genérico.
3. Si fallo por `Could not find changelog section for...`, verifica que el tag coincide exactamente con el encabezado `## vX.X.X.X` de `docs/changelog.md`.
4. Corrige y vuelve a disparar con `gh workflow run`.

### B. Si el tag apunta a un commit incorrecto

1. No borres, muevas ni reutilices el tag distribuido.
2. Corrige la causa mediante una rama
   `vantareapp/hotfix-isa-<número>-<descripción>` basada en `master`.
3. Integra el hotfix mediante PR, gates estrictos y aprobación explícita de Isaac.
4. Incrementa el cuarto segmento del parche (`v0.1.0.0` -> `v0.1.0.1`).
5. Crea el tag nuevo únicamente sobre el commit ya contenido en `master`.
6. Documenta que el tag anterior queda retirado, sin alterar su referencia histórica.

### C. Si se descubre un bug critico post-tag

1. No reutilices la etiqueta.
2. Crea `vantareapp/hotfix-isa-<número>-<descripción>` desde `master`; nunca hagas commit directo en una rama protegida.
3. Abre PR a `master`, ejecuta todos los gates y obtén la aprobación explícita de Isaac.
4. Lleva el mismo cambio de vuelta a `nightly` mediante una rama de issue normal
   y PR; desde allí fluirá a `testers` sin saltarse canales.
5. Incrementa el cuarto segmento del parche (`v0.1.0.0` -> `v0.1.0.1`).
6. Etiqueta y publica la nueva build siguiendo el flujo ordinario.
7. Documenta el fix en `docs/changelog.md` bajo la nueva version.

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
