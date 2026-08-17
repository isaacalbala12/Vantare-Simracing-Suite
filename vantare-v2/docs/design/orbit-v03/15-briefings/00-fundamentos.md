# Briefing 00 · Fundamentos (tema, tokens, sprite, fuentes)

## Objetivo
Que el frontend pueda pintar cualquier componente Orbit con los tokens exactos, sin tocar páginas.

## Alcance
- Crear `frontend/src/themes/vantare-orbit.json` desde `docs/design/orbit-v03/vantare-orbit.theme.json`.
- Extender `frontend/src/lib/theme.ts`: `ThemeId` += `"vantare-orbit"`; `ThemeColors` += `coral, ember, cyan, line, lineStrong, primaryBg, primaryInk` (opcionales con defaults Orbit); `ThemeEffects` += `radius, row, space, railWidth, columnWidth, topbarHeight, ease`; `cssVarsFromTheme` emite `--v-*` nuevos. Test en `lib/theme.test.ts`.
- Añadir `frontend/src/styles/orbit.tokens.css` (copia de `docs/design/orbit-v03/orbit.tokens.css`) importado en `index.css` tras `@import "tailwindcss"`; mapear en `@theme` al menos `--color-orbit-{canvas,ink,ink-2,ink-3,line,carmine,red,coral,ember,green}`, `--radius-orbit`, `--font-orbit-sans/mono`.
- Fuentes locales: Inter (variable) y Cascadia Code en `frontend/src/fonts.css` (`@font-face`, `font-display: swap`); eliminar cualquier `<link>` a Google Fonts.
- Sprite: `frontend/src/assets/orbit-icons.svg` con los 14 `<symbol id="i-*">` del prototipo y componente `ui/orbit/Icon.tsx` (`name`, `size`, `strokeWidth`).
- Densidad: `document.body.dataset.density` leída de settings (`compact|balanced|comfortable`), persistida.

## Criterios de aceptación
- [ ] `applyTheme(orbit)` deja en `:root` `--v-bg:#08090b`, `--v-red-500:#f04755`, `--v-coral:#ff6a5f`, `--v-radius:18px`.
- [ ] Un `<div class="bg-orbit-canvas text-orbit-ink rounded-orbit">` renderiza con esos valores.
- [ ] `<Icon name="i-inicio" size={23} strokeWidth={1.75}/>` pinta el icono del rail idéntico al del HTML.
- [ ] Sin peticiones de red a fonts.googleapis.com; Inter y Cascadia visibles offline.
- [ ] `[data-density="compact"]` cambia `--v-row` a 42px.
- [ ] `pnpm --dir frontend test` y `lint` verdes.

## Referencias
`02-tokens.md`, `orbit.tokens.css`, `tokens.json`, `vantare-orbit.theme.json`; HTML líneas de `:root` y `<svg style="display:none">` (sprite).
