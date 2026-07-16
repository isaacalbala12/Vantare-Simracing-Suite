# Verificacion manual

Guia para validar cambios sin leer codigo.

## Arrancar app en modo seguro

Desde `vantare-v2`:

```powershell
pnpm --dir frontend build
go run ./cmd/vantare -live=false -profile configs/example-racing.json
```

Usa `-live=false` para no depender de LMU.

## Checklist general

- La app abre sin ventana de error.
- El Hub carga primero.
- El topbar muestra las secciones esperadas.
- No aparecen errores visibles.
- Los botones principales responden.
- Si guardas algo, aparece confirmacion o el cambio persiste.

## Overlays Studio - biblioteca

1. Abre la app.
2. En el topbar, entra en `Overlays Studio`.
3. Comprueba que aparecen:
   - `Widgets`,
   - `Mis perfiles`,
   - `Recomendados por Vantare`,
   - `Comunidad`.
4. Comprueba que `Comunidad` indica `Proximamente`.
5. Comprueba que no hay una pestaña visible separada llamada `Preview`.

## Overlays Studio - Widgets

1. Entra en `Overlays Studio`.
2. Pulsa la tarjeta `Widgets`.
3. Selecciona un widget.
4. Comprueba que puedes editar propiedades de widget.
5. Comprueba que NO aparecen:
   - `POSICION Y TAMANO`,
   - campos `X/Y/W/H`,
   - boton `Eliminar`.
6. Cambia una propiedad simple y revisa que el estado de guardado responde.

## Overlays Studio - Relative configurable

1. Entra en `Overlays Studio`.
2. Pulsa `Widgets`.
3. Selecciona `relative`.
4. Activa `Mostrar mejor vuelta` y `Mostrar ultima vuelta`.
5. En `Altura de filas`, prueba:
   - `Rellenar altura del widget`,
   - `Reducir altura visual`.
6. En modo compacto (`Reducir altura visual`), comprueba:
   - el bloque queda centrado en el checkerboard;
   - no hay espacio vacio grande a la derecha;
   - las columnas siguen alineadas por fila;
   - no hay clipping de nombre, gap o vueltas;
   - al cambiar formato/ancho de columnas, el bloque crece o encoge alrededor del centro.
7. En modo fill, comprueba que el widget respeta la caja guardada del layout.
8. Cambia filtros:
   - `Coches delante`,
   - `Coches detras`,
   - `Filtro de clase`,
   - `Mostrar coche del jugador`.
9. Verifica que los cambios se guardan y se mantienen al recargar.

Si la preview aislada vuelve a mostrar offsets, clipping o cajas invisibles, revisar `widget-preview-bug-log.md` antes de aplicar fixes visuales.

## Overlays Studio - Mis perfiles y layout

1. Entra en `Overlays Studio`.
2. Pulsa la tarjeta `Mis perfiles`.
3. Comprueba que aparecen perfiles propios con preview real o, si falta el config, `Preview no disponible`.
4. Comprueba que cada perfil tiene `Editar layout`.
5. Pulsa `Editar layout` en un perfil.
6. Deben existir controles de posicion/tamano en `LayoutStudio`.
7. Mueve o redimensiona un widget si la UI lo permite.
8. Guarda y vuelve a abrir para comprobar persistencia.

## Crear perfil

1. En `Overlays Studio`, usa `Nuevo perfil` si esta disponible.
2. Crea un perfil de prueba.
3. Comprueba que vuelve a aparecer en la lista sin reiniciar la app.
4. Si no aparece, reportar como bug de refresco de perfiles.

## Recomendados por Vantare

1. Entra en `Overlays Studio`.
2. Pulsa la tarjeta `Recomendados por Vantare`.
3. Comprueba que aparecen presets oficiales con preview real.
4. Pulsa `Guardar como perfil propio` en uno de ellos.
5. Introduce un nombre.
6. Vuelve a `Mis perfiles` y comprueba que el nuevo perfil aparece.

## Overlay runtime live

1. Usa un perfil valido.
2. En `Mis perfiles`, pulsa `Abrir overlay` en un perfil.
3. Comprueba que aparece el overlay desktop.
4. Comprueba que la accion cambia a `Detener overlay`.
5. Pulsa `Detener overlay`.
6. Comprueba que el overlay se cierra y no quedan ventanas inesperadas.
7. Entra en `LayoutStudio` del mismo perfil.
8. Comprueba que existe `Abrir overlay`.
9. Mueve un widget para dejar el layout en estado `dirty`.
10. Comprueba que `Abrir overlay` se deshabilita.
11. Guarda.
12. Comprueba que `Abrir overlay` vuelve a habilitarse.

## Overlay Studio V3 — smoke de produccion (Fase 7)

Usar una **copia migrada** del perfil de Fase 0, nunca el unico perfil del usuario. Conservar el `.pre-v3.bak` generado por la migracion.

Comandos de gate automatizado (2026-07-11, rama `refactor`):

```powershell
pnpm --dir vantare-v2/frontend test
pnpm --dir vantare-v2/frontend build
pnpm --dir vantare-v2/frontend visual:overlay-studio
cd vantare-v2; go test ./internal/app/... ./cmd/vantare/... -count=1
```

Resultado registrado: frontend 2084/2084 PASS, build PASS, visual 59 baselines 0.000% delta + parity, Go app PASS. `go test ./...` conserva fallos preexistentes en `internal/server` (nonce/port).

Checklist manual en Wails (perfil de prueba):

1. Abrir Hub → `Overlays Studio`: entra **directo** al editor V3 del perfil activo (sin home v5.2). Si no hay activo, muestra crear/seleccionar/recomendados.
2. Cambiar sesion (Practice/Qualifying/Race/Endurance); editar y guardar un layout independiente por sesion.
3. Arrastrar/redimensionar Delta, guardar, undo/redo, reabrir y verificar persistencia.
4. Cambiar Original/Crystal en los cuatro widgets.
5. Mock session/location y Live desconectado en preview.
6. Iniciar overlay Desktop; guardar en Studio y verificar **un** refresh automatico.
7. Abrir Browser View; verificar estado guardado y reconexion SSE.
8. Borrar los cuatro widgets V3, guardar, verificar Desktop/OBS transparentes y payloads legacy preservados en JSON.
9. Restaurar fixture; hotkey de edicion abre/enfoca Overlay Studio con Desktop fullscreen click-through.
10. Forzar conflicto de save y fallo de disco; verificar que el borrador local sigue intacto.

Rollback ensayado (orden): revert `refactor(studio): switch Hub route` → OBS runtime → Desktop runtime → lifecycle Go.

## Que reportar si algo falla

Indica:

- pantalla donde ocurre,
- boton pulsado,
- texto del error,
- si estabas en mock o live,
- si el fallo se repite al reiniciar.
