# Overlay Workshop — guía de autoría directa

- Estado: guía canónica de autoría (ISA-291 / OS-09G2)
- Autoridad superior: `docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
- Contrato del programa: `docs/overlays-studio/os-09-overlay-workshop-contract.md`

## Regla de oro

Se edita el TSX/CSS productivo. Workshop no convierte, exporta ni copia nada.
La URL `/workshop` renderiza ese mismo código mediante `WidgetVisualHost`.

Cuando apruebas lo que ves en Workshop, ya está aprobado el código de la
aplicación. No hay un segundo paso de traducción.

## Abrir el bucle rápido

1. Verifica rama y worktree (`git status --short` debe estar limpio).
2. Ejecuta `corepack pnpm --dir frontend dev`.
3. Abre una URL reproducible de `/workshop` (ver ejemplos abajo).
4. Edita el renderer o el CSS de producto.
5. Vite aplica HMR sobre el root sin reiniciar el servidor.
6. Antes de entregar cambios de *tooling*, ejecuta
   `corepack pnpm --dir frontend smoke:overlay-workshop-hmr`.

`/workshop` solo existe en desarrollo: `isOverlayWorkshopPath` en
`frontend/src/overlay/authoring/overlay-workshop-query.ts` exige `import.meta.env.DEV`.
No aparece en la build de Stable.

### URLs de ejemplo

Delta Original, estado listo, superficie Studio:

```text
http://localhost:5173/workshop?widget=delta&system=vantare-original&design=delta-original-base&state=ready&surface=studio&variant=default&session=race&location=track&background=grid&scale=1&preset=1080p
```

Delta Crystal Simple, comparando Studio contra OBS:

```text
http://localhost:5173/workshop?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&compare=obs&variant=default&session=race&location=track&background=transparent&scale=1&preset=1080p
```

Parámetros aceptados y sus valores válidos están declarados en
`parseOverlayWorkshopQuery`. Un valor inválido no cae a un default silencioso:
devuelve un error explícito (`invalid design parameter: ...`). El parser también
comprueba coherencia — un `design` cuyo `widgetType` o `systemId` no coincida con
`widget`/`system` es rechazado.

## Mapa del código

| Capa | Ruta | Qué contiene |
|---|---|---|
| Frontera de render | `frontend/src/overlay/core/WidgetVisualHost.tsx` | Único punto que resuelve y monta un renderer |
| Tipo funcional | `frontend/src/overlay/widget-types/<tipo>/<tipo>-definition.ts` | ViewModel puro, capacidades, tamaño por defecto |
| Registro de tipos | `frontend/src/overlay/core/widget-registry.ts` | Imports explícitos de cada definición |
| Sistema visual | `frontend/src/overlay/design-systems/<sistema>/manifest.ts` | Registra renderer + controles de inspector + `parseSettings` por widget |
| Renderer | `frontend/src/overlay/design-systems/<sistema>/<widget>/<Nombre>.tsx` | El componente real que se dibuja |
| Estilos del sistema | `frontend/src/overlay/design-systems/<sistema>/tokens.css` | Tokens y reglas visuales |
| Catálogo | `frontend/src/overlay/design-systems/official-designs.ts` | Los 41 diseños oficiales, escritos a mano |
| Fixtures | `frontend/src/overlay/authoring/fixtures/authoring-fixtures.ts` | Datos deterministas por estado/escenario |

Los renderers reciben ViewModels puros. **Nunca** acceden a persistencia,
permisos, Wails/SSE ni posición en el canvas.

## Receta 1 — Restyle de un diseño existente

Cambiar cómo se ve un diseño que ya está en el catálogo.

1. Localiza el diseño en `official-designs.ts` por su `id`.
2. Sigue su `systemId` + `widgetType` hasta el manifest del sistema, y de ahí al
   renderer concreto.
3. Cambia el CSS o el TSX **final más pequeño posible**.
4. No añadas otro renderer, otro host ni otro catálogo.

**Ejemplo concreto — Delta Original.**
`delta-original-base` → `systemId: "vantare-original"`, `widgetType: "delta"` →
`design-systems/vantare-original/manifest.ts` importa `DeltaOriginal` desde
`./delta/DeltaOriginal` → editas
`design-systems/vantare-original/delta/DeltaOriginal.tsx` o las reglas `.vo-delta*`
de `design-systems/vantare-original/tokens.css`.

Checks: `vitest run src/overlay/design-systems/vantare-original/delta/DeltaOriginal.test.tsx`

## Receta 2 — Nueva composición del mismo widget y sistema

Otra forma de dibujar el mismo dato, dentro del mismo sistema visual.

1. Añade un `templateId` literal al archivo de settings del renderer.
2. Valídalo con su parser y define un **fallback explícito**.
3. Renderiza la composición dentro del renderer del sistema existente.
4. Registra el diseño en `official-designs.ts`.

**Ejemplo concreto — Delta Crystal.** Es la referencia real del repo:
`design-systems/vantare-crystal/delta/delta-settings.ts` declara

```ts
export const DELTA_TEMPLATE_IDS = ["delta-bar", "delta-simple"] as const;
export type DeltaTemplateId = (typeof DELTA_TEMPLATE_IDS)[number];
```

y `parseDeltaSettings` decide la composición. Un valor desconocido **no crea una
rama implícita**: cae al fallback declarado (`delta-bar`) y marca
`templateDiagnostic: "unknown-template"`, de modo que el fallback es observable
en vez de silencioso.

`DeltaCrystal.tsx` despacha entre `DeltaBarCrystal.tsx` y `DeltaSimpleCrystal.tsx`.
Los dos diseños viven en el catálogo como `delta-crystal-bar` y `delta-crystal-simple`.

Checks: `vitest run src/overlay/design-systems/vantare-crystal/delta/` +
`src/overlay/design-systems/official-designs.test.ts`

## Receta 3 — Nuevo tipo funcional

Un widget que muestra un dato que ningún tipo existente cubre.

1. Define el tipo y su **ViewModel puro** en
   `widget-types/<tipo>/<tipo>-definition.ts`.
2. Regístralo en `core/widget-registry.ts` (import explícito, no glob).
3. Implementa un renderer **por cada sistema soportado**.
4. Registra el widget en el `manifest.ts` de cada sistema y añade sus diseños a
   `official-designs.ts`.
5. Añade fixture neutral en `authoring/fixtures/authoring-fixtures.ts` y tests.

Si un tipo solo existe en un sistema, decláralo así y no fabriques un registro
vacío en el otro. `engineer-radio` es el precedente real: solo `vantare-crystal`,
y el parser de la query lo rechaza explícitamente con otro sistema.

Checks: `vitest run src/overlay/core/overlay-workshop-characterization.test.ts` +
`src/overlay/design-systems/official-designs.test.ts` + `design-system:check`

## Receta 4 — Nuevo sistema visual

Una identidad visual completa, paralela a `vantare-original` y `vantare-crystal`.

1. Define tokens y reglas visuales del sistema en su propio `tokens.css`.
2. Añade `manifest.ts` **versionado** (`systemVersion`).
3. Registra **solo** los widgets realmente implementados.
4. No fuerces una abstracción común sobre composiciones que son distintas.

Un sistema con 6 widgets bien hechos es válido. Un sistema con 19 registros de los
que 13 son placeholders, no.

Checks: los mismos de la Receta 3, más `build`.

## HTML de referencia

Un HTML puede fijar píxeles, proporciones y estados visuales. Sirve para acordar
cómo debe verse algo.

No es código fuente, no se compila y **no crea una segunda implementación**. Si
un HTML y el renderer productivo discrepan, la verdad ejecutable es el renderer.

## Escalera de checks

Aplica el escalón que corresponda; no subas de golpe al último.

- **Durante la edición:** HMR aplicado, consola limpia, y revisar el estado y la
  superficie afectados en `/workshop`.
- **Antes de commit:** Vitest focal, ESLint focal, `git diff --check`, y `build`
  si tocaste producto.
- **Entrega visual:** estados (`ready`/`stale`/`disconnected`/`error`), fondos,
  superficies y protocolo visual focal.
- **Programa:** compile-out de Stable, protocolo completo, handoff actualizado y
  aprobación explícita de Isaac.

Comandos:

```bash
corepack pnpm --dir frontend dev
```

```bash
corepack pnpm --dir frontend test
```

```bash
corepack pnpm --dir frontend design-system:check
```

## Cambio → archivos → checks

| Cambio que pides | Archivos que se tocan | Checks focales |
|---|---|---|
| "Cambia el color/espaciado de Delta Original" | `vantare-original/tokens.css` | `DeltaOriginal.test.tsx` |
| "Delta Original sin cabecera" | `vantare-original/delta/DeltaOriginal.tsx` | `DeltaOriginal.test.tsx` |
| "Otra composición de Delta Crystal" | `vantare-crystal/delta/delta-settings.ts` + nuevo `*Crystal.tsx` + `official-designs.ts` | `delta-settings.test.ts`, `official-designs.test.ts` |
| "Un widget nuevo de presión de neumáticos" | `widget-types/*`, `widget-registry.ts`, `manifest.ts` ×2, `official-designs.ts`, fixtures | caracterización + catálogo + `design-system:check` |
| "Un sistema visual nuevo" | `design-systems/<nuevo>/**`, `design-system-registry.ts` | todo lo anterior + `build` |

## Prohibiciones

- DSL universal o renderer por JSON.
- Conversor HTML → producción.
- `import.meta.glob`, barrel generado, scaffolder obligatorio o `catalogPosition`.
- Imports de renderers concretos desde Workshop (el test de caracterización lo
  bloquea y nombra el archivo ofensor).
- Fixtures live, Wails/SSE o persistencia dentro de authoring.
- Regenerar baselines para ocultar diferencias.

## Nota de mantenimiento del smoke

`frontend/scripts/overlay-workshop-hmr-smoke.mjs` ancla su mutación temporal a
dos líneas literales de `DeltaOriginal.tsx` (`data-tone={model.tone}` seguida de
`className="vo-delta"`, con su indentación exacta). Si reformateas o reordenas ese
JSX, actualiza `TSX_ANCHOR` en el script. El fallo es ruidoso
(`expected exactly one anchor, found 0`), nunca silencioso.
