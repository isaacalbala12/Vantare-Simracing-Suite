# ISA-1150 — blur condicional en la shell del Hub

Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1150
Rama: `vantareapp/isa-1150-blur-perf`; PR draft contra `nightly`.

## Qué cambia

Go ya publicaba `performance:level` (`OverlayPerformanceV2`) con
`effects: "full" | "noBlur" | "flat"`, pero solo lo consumían los widgets del
overlay (widgetHz/rafCap). La shell del Hub lo ignoraba.

`useOrbitPerfEffects` (`frontend/src/hub/orbit/`) refleja ese `effects` en
`:root[data-orbit-perf-effects]`, siguiendo el patrón de
`data-orbit-resizing`: atributo imperativo sobre `documentElement`, sin
re-render de React y con cobertura de los portales. La suscripción se monta en
`OrbitShellBody` y emite `settings:get` para recibir la política vigente al
arrancar (Go solo reemite `performance:level` cuando algo lo provoca; emitirlo
más de una vez es inofensivo).

## Cobertura de `backdrop-filter` (noBlur y flat)

Se apagan los que repintan con scroll o contenido dinámico:

| Selector | blur | Por qué |
|---|---|---|
| `.orbit-topbar` | 23px | banda full-width, repinta a cada frame |
| `.orbit-races__group-head` | 8px | sticky: repaint por frame de scroll |
| `.orbit-studio-toolbar` | 16px | ya estaba en la lista de `data-orbit-resizing` |
| `.orbit-surface` | 16px (`--orbit-panel-blur`) | paneles grandes del kit |

Los fondos translúcidos se mantienen (`--orbit-topbar-bg` 82 %,
`--orbit-panel-bg` 79 %): el blur es frosting, no opacidad.

Quedan fuera por coste despreciable —repintan una vez al abrirse, no con
scroll—: `.orbit-palette-backdrop` (6px), `.orbit-drawer__scrim` (3px) y
`.orbit-confirm__scrim` (3px).

## Extra de `flat`

`flat` es el presupuesto mínimo: además del blur, corta las animaciones
infinitas y las sombras grandes.

- `animation: none` en `.orbit-launcher__skeleton-*` (el shimmer repintaba
  `background-position` por frame —mismo resultado que
  `prefers-reduced-motion`—), `.orbit-pill--pulse`/`[data-s]` dots,
  `.orbit-btn__loading` y `.orbit-btn--run[data-s="running"]` (pulsos de
  opacidad: baratos, pero `flat` significa sin efectos).
- `box-shadow: none` en `.orbit-featured` y su hover (sombras de 91–110 px,
  las mayores del kit).

Se conservan a propósito:

- Las sombras de `.orbit-tl__block`: el anillo `inset` de `aria-pressed` es la
  affordance de selección, no decoración.
- `orbit-slot-pulse` (0,5 s, one-shot) y las transiciones: no son infinitas.
- `.orbit-races__mev:hover filter: brightness(1.35)`: repaint de un chip
  puntual en hover; coste marginal frente a sticky/topbar.

## Fuera de alcance

- Las variantes `noBlur`/`flat` de los design-systems de overlay
  (crystal/endurance): otra superficie y otro documento (los widgets viven en
  su propia ventana; el atributo solo existe en el documento del Hub).
- El shimmer por `transform` o el slot-pulse por pseudo-elemento (puntos 2–3
  de la solución de la issue): mejoras permanentes independientes del nivel.

## Verificación

- `pnpm --dir vantare-v2/frontend test`: 425 archivos, 3360 tests en verde.
- `typecheck`, `lint`, `build`: sin errores.
- Tests nuevos: `use-orbit-perf-effects.test.tsx` (atributo, `settings:get`,
  payload inválido, limpieza al desmontar) y un caso en `HubApp.test.tsx` que
  monta la shell real y despacha `performance:level`.
- Manual: en Ajustes → Rendimiento, un preset/perfil que publique
  `effects:"noBlur"` debe quitar el frosting de topbar, paneles y cabeceras de
  Carreras sin tocar la opacidad; Paint flashing de DevTools muestra menos
  repaints al hacer scroll.
