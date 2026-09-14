# ISA-1011: runtime aprobado y empaquetado reproducible

Base: nightly afc6509a. Isaac autoriza corregir el bloqueo de confianza y
relanzar Nightly.15. No se cambia la confianza compilada ni el helper.

## Causa y decisión

El run 34062671599 intento 2 pasa Go y frontend, pero no empaqueta por trust
mismatch. Contra ae66720d (Nightly.14), helper, módulos y scripts no tienen
diferencias. Go 1.25.0 y GCC 16.2.0-3 coinciden; los paquetes CRT, headers y
winpthreads de MSYS2 pasaron de r302 a r353. El build depende de un repositorio
rolling, aunque compare dos compilaciones dentro del mismo runner.

Se empaqueta la unidad ya aprobada de Nightly.14. No se acepta un nuevo hash,
no hay fallback ante fallo y no se ejecuta UpdateTrustSource. Para cambiar
el reader debe reconstruirse desde fuente y auditarse una nueva unidad.

## Procedencia y verificación

- Archivo oficial: release v0.1.0.7-nightly.14, vantare-portable-amd64.zip.
- SHA256: a931be3ad57a5442c4a64ae3b2c52431df3b9fdeb92248dd2d237f18362f010f.
- Manifiesto: 700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869.
- Helper: ccdab7176517c4cda7b9edb4bdcfcd6b8eb4eaafb6b31f5cabdfe3313d301503.
- DLL: 2b7468a4ad844429e6af2fde0b5f91893e8130a5686a88f11442ab547c7ede46.

La descarga se verifica antes de extraer. Solo se extraen cinco nombres
exactos (no el ejecutable Vantare antiguo ni sus configuraciones). La
verificación existente comprueba manifiesto compilado, hashes, inventario,
SBOM y licencias antes del smoke; después vuelve a verificar el destino.

Pruebas locales: RED de selección/archivo alterado, GREEN tras implementación;
extracción real de ZIP publicado, verify-runtime y smoke-runtime PASS;
prepare-runtime -UsePublishedRuntime completo PASS (descarga incluida).
El ZIP usa separadores Windows; la primera extracción falló cerrada por
conteo, se ajustó al formato observado y pasó. No se relajó la allowlist.

## Límites y rollback

Depende de disponibilidad del asset histórico; si falta o cambia, falla.
No se cambia la arquitectura de telemetría ni las dependencias ejecutadas.
La compilación manual existente sigue en prepare-runtime sin el switch.
Revertir este corte restaura compilación desde fuente, también restaura el
bloqueo bajo toolchain rolling. CI y publicación final se registran en #1011
y #1009; estos checks locales no demuestran una release publicada.
