# Banco de huella

Los scripts de este directorio miden builds reales de Vantare. La higiene de
procesos, la escena y la identidad exacta del binario forman parte del
resultado; una corrida que incumpla cualquiera de esos requisitos se descarta.

## Build de medida con licencia

Toda build usada por `huella.ps1` o `sesion-v1.ps1` debe embeber la
configuración autorizada de `frontend/.env.local` en compile-time:

1. Mapear en el proceso de build `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` a `VANTARE_SUPABASE_URL` y
   `VANTARE_SUPABASE_ANON_KEY`. Mapear también
   `VANTARE_LICENSE_PUBLIC_KEYS` cuando esté configurado.
2. Ejecutar `corepack pnpm --dir frontend build`.
3. Ejecutar `tools/generate_supabase_config.ps1` y después `go build` en el
   mismo proceso, eliminando el Go generado al terminar.
4. Verificar por CDP que `license:changed` no devuelve `unconfigured` antes de
   empezar a muestrear.

Está **prohibido medir con una build sin licencia configurada**. `huella.ps1`
aplica este gate automáticamente y guarda un manifiesto `*-license.json` con
datos sanitizados: estado, `configured`, tipo de cuenta
(`authenticated|anonymous`) y `deviceOK`. No guarda usuario, correo, token ni
valores de configuración.

No se deben imprimir, copiar ni versionar los valores de `.env.local`. El
fichero se lee únicamente desde su ubicación autorizada durante el build.

El procedimiento reproducible es:

```powershell
pwsh -File scripts/bench/build-measurement.ps1 `
  -EnvFile C:\ruta\autorizada\frontend\.env.local `
  -OutFile bin\vantare-isa894.exe
```
