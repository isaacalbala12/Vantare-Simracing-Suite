# Studio A: estados de pantalla

PR 6 de `ESPEC-A.md`, VANTA-138 / #1995. La presentación distingue un layout
vacío de un documento ausente, protegido o todavía pendiente de lectura. No
crea documentos ni sustituye ajustes ilegibles por valores de demostración.

`StudioFocus` conserva el catálogo modal y `MoreMenu` de PR 5 y utiliza
`StudioSteps` con `readOnly` para las instancias conocidas de un documento
protegido. Si el anfitrión no aporta instancias, muestra únicamente el motivo
de solo lectura. Los estados de guardado, conflicto, reintento y descarte
siguen usando `screens/studio/state.tsx` y sus revisiones CAS existentes.

## Comprobación visual

Los adaptadores están en `scripts/visual-diff/studio-states.ts`. Admiten las
trece escenas de la maqueta con el prefijo `studio-estado-`:

```text
delta std-e std-v fuel oculto pista contenido menu add
vacio protegido guardando error
```

Los casos negativos adicionales son `ilegible`, `cargando`, `missing`, `error-lectura`, `protegido-error` y `recarga`.
Solo los primeros trece tienen una escena equivalente en `variante-a.html`.
Las escenas de guardado/error retienen o rechazan una petición al mock local;
no fuerzan un estado decorativo en el renderer. Tras capturar, el adaptador restaura la emulación en la misma sesión CDP, cierra menús y espera el plazo normal de las peticiones retenidas antes de cerrar.

Usar el banco existente descrito en `studio-focus-captures.md`, con el cerrojo
global tomado, variables de QA y cachés en D:, y sin compilar durante la captura:

```powershell
bun scripts/visual-diff.ts --scene studio-estado-protegido --theme dark --width 1440 --height 900 --capture-only --capture-expanded-sidebar --references <referencias> --output <evidencia>
bun scripts/studio-reference.ts --prototype <variante-a.html> --current <evidencia>/dark/studio-estado-protegido/current.png --output <comparacion> --state protegido --theme dark --sidebar closed --size 1440
```

Repetir con `--theme light`, `expanded-sidebar.png` / `--sidebar open` y
1280×720 / `--size 1280`. Cada comparación verifica los nueve TTF locales y
las versiones de Chromium/V8 del candidato. Conserva referencia, par, diff,
porcentajes de ventana completa y recibo de cierre del visor; los PNG no se
versionan en el repositorio.

Para el estrés de la maqueta a 125 %, establecer únicamente en el controlador
QA `VANTARE_STUDIO_VISUAL_ZOOM=125`, capturar a 1440×900 y comparar con
`--size z125`. El adaptador emula 1152×720 lógicos, conserva el cliente físico
y verifica la tira de 72 px. No cambia el zoom guardado ni el techo del producto:
a 1440×900, 125 % no es un nivel ofrecido por el selector porque dejaría menos
de los 1280×720 lógicos aprobados.

La maqueta compacta los hijos de la tira a ese ancho, pero su regla de container
query intenta cambiar la cuadrícula del propio contenedor y no llega a reducir
su columna. El producto sí aplica los 72 px especificados. Esa diferencia debe
anotarse al leer los porcentajes; no se altera la maqueta para esconderla.

La evidencia de esta entrega vive en el directorio de evidencia del servidor
`hub-web/isa-1995-studio-a-6-estados/`: `EVIDENCIA-FINAL.md`,
`COMPARACIONES.md`, `metricas.json` y los recibos por tamaño/estado/tema/barra.

## Regresiones de lectura y foco

Volver a cargar vuelve a pedir `studio.get`; no reproduce una escritura fallida.
El foco se restaura en un efecto posterior al commit de React: fila seleccionada,
primera fila o lista vacía enfocable. Si el núcleo resulta ausente, se enfoca su
aviso. Si falla la lectura inicial, desaparece el esqueleto y queda un error con
recarga. La protección y su recarga permanecen visibles aunque falle otra petición.
Todos los textos de estos estados viven en `i18n/studio.ts`.

`check-studio-states.ts`, ejecutado por `web-a11y.ts` en Chromium de CI, comprueba
la tira real a 1280×720 con barra abierta (72 px, etiqueta oculta por CSS, nombre
accesible y catálogo operable), el retorno de foco y la recuperación de lectura.
Los tests de componente cubren conflicto CAS, límite, plan sin verificar y Solo
lectura, además de las escrituras, reintento y descarte existentes. No se simula
el compacto cambiando `hidden` en el test.

Para el catálogo abierto con barra expandida se usa `studio-estado-add-abierto`:
la barra se prepara antes del modal. No se intenta atravesar su bloqueo de atajos.
