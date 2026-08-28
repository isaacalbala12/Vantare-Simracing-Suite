# ISA-893 — prueba Wails/LMU pendiente por exclusión de máquina

## Estado

La integración y todos los gates estáticos se completaron, incluido
`wails3 task build`. También se construyó el binario diagnóstico propio
`bin/vantare-isa893.exe` (SHA-256
`76FEAA20AE4A196A8FD67D0B57E2A8E7FD46D360B78B089795BC99B9EE288796`) y se
preparó el perfil real de catálogo completo, con 20 widgets.

La prueba Wails/CDP no se lanzó. La coordinación de máquina exigía esperar
hasta que no existiera ningún proceso `vantare-baseline*`, con sondeo cada
30 segundos y límite de 60 minutos. Entre 00:41:52 y 01:41:52 (Europe/Madrid)
se observaron sucesivamente los PID 29128, 33620, 25140, 14540, 27256, 26652,
28064, 36732 y 30380. Los huecos breves se verificaron durante 30 segundos
antes de arrancar; en cada uno apareció la siguiente repetición. El PID 30380
seguía activo al agotarse el límite.

Por tanto:

- no se inició `vantare-isa893.exe`;
- no se abrió el puerto CDP 9243;
- no se generó ni se afirma una captura Wails/LMU;
- no se tocó ni cerró el baseline, PresentMon, `vantare-isa940` ni LMU;
- no quedó ningún proceso propio que cerrar.

`capture-wails-v2.mjs` queda como sonda reproducible para la siguiente ventana
libre. Exige exactamente los 20 tipos, un contenedor pintado por widget, cero
errores de renderer o diagnósticos de autoridad y al menos un frame live
decodificado por el store V2 antes de guardar JSON y PNG.

## Gates completados antes del intento

```text
corepack pnpm --dir frontend test
Test Files  424 passed (424)
Tests       3227 passed (3227)

corepack pnpm --dir frontend typecheck
> tsc -b --noEmit
exit 0

corepack pnpm --dir frontend lint
> eslint .
exit 0

corepack pnpm --dir frontend build
✓ 1095 modules transformed.
✓ built in 1.77s

go test ./internal/telemetry/... ./internal/app/... -count=1
exit 0

go run ./tools/telemetry-contract-gen -check
exit 0, sin salida

wails3 task build
exit 0; bin/vantare.exe generado y temporales limpiados

python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly --check
sin cambios

git diff --check
exit 0

git merge-base --is-ancestor origin/nightly HEAD
exit 0
```

