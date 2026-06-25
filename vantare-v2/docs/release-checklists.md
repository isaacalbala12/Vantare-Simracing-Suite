# Release Checklists

Checklists operativas por fase.

## Alpha privada checklist

Producto:

- [ ] App arranca.
- [ ] Hub carga sin errores visibles.
- [ ] Overlays Studio es el flujo principal.
- [ ] Perfil recomendado puede abrirse.
- [ ] Recomendado puede copiarse como editable.
- [ ] Perfil propio guarda y recarga.
- [ ] Overlay desktop abre y cierra.
- [ ] Mock/live/demo se entiende en editor.

Layout:

- [ ] `LayoutStudio` permite mover widgets.
- [ ] `LayoutStudio` permite redimensionar widgets.
- [ ] Guardar layout conserva X/Y/W/H.
- [ ] Reabrir app conserva layout.
- [ ] `LayoutStudio` no edita columnas, metricas ni formatos internos.

Widgets:

- [ ] `WidgetStudio` no muestra X/Y/W/H.
- [ ] `WidgetStudio` no permite borrar widgets.
- [ ] `WidgetStudio` no abre/detiene overlay.
- [ ] `Relative` permite configurar todas sus opciones aprobadas.
- [ ] `Standings` permite configurar todas sus opciones aprobadas excepto multiclase.
- [ ] Preview aislada centra y escala correctamente.
- [ ] Preview aislada de `Relative` no conserva espacio vacio derecho en fill ni compact.
- [ ] Preview aislada de `Standings` usa ancho intrinseco y no recorta columnas opcionales.
- [ ] `LayoutStudio` y overlay runtime siguen usando `position.w/h`.

UI:

- [ ] Rework visual acotado de `WidgetStudio` aplicado.
- [ ] Paneles son legibles.
- [ ] No hay secciones importantes ocultas por scroll roto.
- [ ] El flujo no parece un prototipo tecnico.
- [ ] No ejecutar nuevos reworks visuales completos hasta cerrar la mayoria de features core.

Checks:

```powershell
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
go test ./pkg/config ./internal/app
git diff --check
```

Release/Discord:

- [ ] `docs/changelog.md` tiene entrada para la version que se va a taggear.
- [ ] La entrada usa secciones cortas: Nuevo, Mejorado, Corregido, Para testers.
- [ ] El tag Git `vX.X.X.X` coincide exactamente con el heading del changelog.
- [ ] El secret de GitHub `DISCORD_WEBHOOK_URL` esta configurado en el repo oficial.
- [ ] Al pushear el tag `v*`, GitHub Actions publica el changelog en Discord.

## Beta testers checklist

Producto:

- [ ] Todo lo de alpha privada esta cerrado.
- [ ] Build compartible generado.
- [ ] Instrucciones de instalacion escritas.
- [ ] Known issues escritos.
- [ ] Canal de bugs/feedback definido.
- [ ] Perfiles recomendados iniciales pulidos.

Features:

- [ ] OBS setup local funciona.
- [ ] URL OBS copiable.
- [ ] Hotkey basica funciona o esta pospuesta explicitamente.
- [ ] Delta best live funciona o tiene decision documentada.
- [ ] `Pedals` beta v1 funciona.

Manual:

- [ ] Tester puede instalar sin ayuda directa.
- [ ] Tester puede abrir overlay.
- [ ] Tester puede editar `Relative`.
- [ ] Tester puede editar `Standings`.
- [ ] Tester puede usar OBS local.
- [ ] Tester sabe donde reportar bugs.

## Beta publica de pago checklist

Pago/acceso:

- [ ] Stripe o checkout externo decidido.
- [ ] Flujo de pago probado.
- [ ] Acceso/licencia probado.
- [ ] Instrucciones de descarga claras.
- [ ] Soporte/refund/feedback definido.

Producto:

- [ ] Todo lo de beta testers esta cerrado.
- [ ] No hay P0/P1 abiertos.
- [ ] P2 aceptados estan documentados.
- [ ] Changelog visible.
- [ ] Version visible.
- [ ] Instalacion/update suficientemente clara.

## Release checklist

Producto:

- [ ] Promesa LMU-first cumplida.
- [ ] Performance validada.
- [ ] Documentacion usuario lista.
- [ ] Known issues publicables.
- [ ] Soporte organizado.
- [ ] Regression suite minima.
- [ ] Smoke test en entorno limpio.

GitHub:

- [ ] Tag `v1.0.0.0`.
- [ ] Release notes.
- [ ] Artefactos adjuntos.
- [ ] Changelog actualizado.
