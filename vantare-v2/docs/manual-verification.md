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
   - `Mis perfiles`,
   - `Widgets`,
   - `Perfiles especificos`,
   - `Recomendados por Vantare`,
   - `Comunidad`.
4. Comprueba que `Comunidad` indica `Proximamente`.
5. Comprueba que no hay una pestaña visible separada llamada `Preview`.

## Overlays Studio - Widgets

1. Entra en `Overlays Studio`.
2. Pulsa `Abrir widgets`.
3. Selecciona un widget.
4. Comprueba que puedes editar propiedades de widget.
5. Comprueba que NO aparecen:
   - `POSICION Y TAMANO`,
   - campos `X/Y/W/H`,
   - boton `Eliminar`.
6. Cambia una propiedad simple y revisa que el estado de guardado responde.

## Overlays Studio - Perfiles especificos

1. Entra en `Overlays Studio`.
2. Abre `Perfiles especificos`.
3. Comprueba que esta zona sirve para colocacion/layout.
4. Deben existir controles de posicion/tamano si el editor de layout ya esta implementado.
5. Mueve o redimensiona un widget si la UI lo permite.
6. Guarda y vuelve a abrir para comprobar persistencia.

## Crear perfil

1. En `Overlays Studio`, usa `Nuevo perfil` si esta disponible.
2. Crea un perfil de prueba.
3. Comprueba que vuelve a aparecer en la lista sin reiniciar la app.
4. Si no aparece, reportar como bug de refresco de perfiles.

## Overlay runtime

1. Usa un perfil valido.
2. Pulsa iniciar overlay si el flujo esta disponible.
3. Comprueba que aparece el overlay.
4. Detenlo desde la UI.
5. Comprueba que no quedan ventanas inesperadas.

## Que reportar si algo falla

Indica:

- pantalla donde ocurre,
- boton pulsado,
- texto del error,
- si estabas en mock o live,
- si el fallo se repite al reiniciar.
