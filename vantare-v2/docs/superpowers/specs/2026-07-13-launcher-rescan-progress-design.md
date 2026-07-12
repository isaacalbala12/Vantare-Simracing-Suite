# Launcher — reescaneo al entrar y progreso híbrido

**Fecha:** 2026-07-13
**Issue:** ISA-9
**Rama:** `vantareapp/isa-9-launcher`
**Estado:** aprobado por Isaac; listo para implementación mediante el plan asociado.

## Objetivo

Al entrar en la pestaña Launcher, ejecutar un único reescaneo de aplicaciones y mostrar sobre la lista una barra de progreso de 0 a 100 %. La interfaz seguirá la opción visual **A — Inline Motion**: sobria, integrada y cercana a Linear, con rojo Vantare y animación como elemento principal.

El cambio no rediseña Launcher, no altera el discovery ni el ranking de iconos corregido en ISA-9 y no añade dependencias.

## Comportamiento

- `LauncherStoreProvider` seguirá manteniendo la suscripción y solicitando el snapshot inicial, pero dejará de iniciar discovery al arrancar globalmente el Hub.
- `LauncherPage` disparará `launcher:apps:discover` una vez en cada montaje. Como `HubApp` monta la página únicamente cuando la sección activa es `launcher`, salir y volver a entrar produce un nuevo reescaneo.
- El botón **Reescanear** reutilizará exactamente el mismo flujo y progreso.
- Mientras se escanea, las aplicaciones y logos del último snapshot permanecerán visibles. No habrá pantalla vacía, skeleton ni sustitución temporal por fallback.
- La barra llegará al 100 % solo cuando el backend confirme que el proceso terminó. Después permanecerá visible brevemente y desaparecerá con una transición de opacidad.
- Si el escaneo falla, el progreso se detendrá y el error existente seguirá siendo la fuente del mensaje. No se simulará una finalización correcta.
- Los intentos concurrentes se mantendrán deshabilitados mientras `scanning` sea verdadero para evitar dos escaneos solapados.

## Progreso híbrido

El backend emitirá un evento ligero `launcher:discovery:progress` con el estado de discovery, separado de `launcher:snapshot`. Esto evita reconstruir snapshots e iconos en cada checkpoint y conserva sin cambios la lista visible.

El payload tendrá:

```ts
type LauncherDiscoveryProgress = {
  scanning: boolean;
  progress: number; // entero limitado a 0..100
  phase: "starting" | "discovering" | "merging" | "resolving-icons" | "complete" | "error";
  error: string | null;
};
```

Checkpoints reales previstos:

1. `starting` — 0 % al aceptar el comando.
2. `discovering` — 15 % antes de consultar registro, rutas conocidas y Steam.
3. `merging` — 55 % al terminar el descubrimiento y comenzar la fusión con apps manuales.
4. `resolving-icons` — 75 % durante persistencia y resolución final de assets.
5. `complete` — 100 % únicamente tras persistir y completar el snapshot final.
6. `error` — conserva el último porcentaje alcanzado y expone el error.

El frontend interpolará suavemente el número mostrado hacia el último checkpoint confirmado, sin superar ese objetivo. La anchura de la barra usará transición CSS. Este reparto hace el movimiento fluido sin presentar como realizado trabajo que el backend aún no ha completado.

## Diseño visual aprobado

La barra aparecerá dentro de `AppsPanel`, entre la cabecera de acciones y la lista:

- Etiqueta principal: “Escaneando apps”.
- Fase secundaria traducida según el checkpoint.
- Porcentaje alineado a la derecha, con `Rajdhani` mediante `var(--v-font-display)`; el resto usa `Inter` mediante `var(--v-font-sans)`.
- Track fino, oscuro y rectangular con proporciones contenidas; relleno sólido `var(--v-red-500)`/token rojo equivalente existente.
- Sin degradado blanco, brillo futurista, estética HUD ni decoración racing extrema.
- Un punto conductor rojo y un pulso muy contenido acompañarán el borde de avance.
- `prefers-reduced-motion: reduce` conservará estado y porcentaje, pero eliminará interpolación, pulso y transiciones prolongadas.
- El componente tendrá `role="status"`, `aria-live="polite"` y texto accesible con fase y porcentaje.

El botón **Reescanear** quedará deshabilitado durante el escaneo y comunicará `aria-busy` para impedir duplicados.

## Arquitectura y archivos previstos

### Backend

- `internal/app/launcher/snapshot.go`: declarar el contrato de progreso/fase.
- `internal/app/launcher/launcher.go`: actualizar estado y emitir checkpoints en los límites reales de `DiscoverApps`.
- Tests del paquete launcher: orden, límites 0–100, éxito y error.

El evento de progreso no contendrá apps, paths ni iconos. El snapshot canónico seguirá emitiéndose una sola vez al finalizar, mediante el handler existente.

### Frontend

- `frontend/src/hub/launcher/launcher-contract.ts`: espejo TypeScript del payload.
- `frontend/src/hub/launcher/launcher-bridge.ts`: una suscripción compartida al evento de progreso.
- `frontend/src/hub/launcher/launcher-store.tsx`: almacenar/notificar progreso junto al snapshot sin registrar listeners por componente.
- `frontend/src/hub/pages/LauncherPage.tsx`: disparar discovery una vez al montar la pestaña.
- `frontend/src/hub/launcher/LauncherScanProgress.tsx`: presentación e interpolación aisladas.
- `frontend/src/hub/launcher/AppsPanel.tsx`: integrar la barra y bloquear el botón mientras escanea.
- `frontend/src/i18n/locales/{es,en,pt,it}.ts`: textos de estado con paridad entre idiomas.
- Tests existentes de bridge/store/page/panel y test focalizado del nuevo componente.

No se introducirá estado global nuevo fuera del store existente ni una librería de animación.

## Errores y concurrencia

- El backend rechazará o ignorará un segundo discovery mientras haya uno activo; la UI también deshabilita la acción.
- Un fallo de persistencia emitirá fase `error`, `scanning: false` y el último porcentaje alcanzado antes del fallo.
- El handler seguirá emitiendo `launcher:error` y el snapshot de error como hasta ahora; el evento de progreso solo añade feedback, no sustituye el contrato de errores.
- La desuscripción del bridge será idempotente y se liberará al detener el store.
- Si Wails no entrega un evento intermedio, el siguiente checkpoint o snapshot final permitirá completar el estado; no se dependerá de temporizadores para declarar éxito.

## Pruebas y verificación

### Automatizadas

- Go: checkpoints ordenados, progreso dentro de 0–100, 100 solo en éxito, estado de error y protección contra escaneos concurrentes.
- Store/bridge: una sola suscripción compartida, forwarding del payload y cleanup idempotente.
- `LauncherPage`: emite un discovery por montaje y vuelve a emitir al salir/entrar mediante remontaje.
- `AppsPanel`: muestra la barra durante scanning, conserva apps, deshabilita Reescanear y oculta la barra tras completar.
- Componente: porcentaje interpolado, fase accesible, final 100 y comportamiento con reduced motion.
- i18n: paridad de claves en los cuatro idiomas.

### Checks

- `go test ./internal/app/launcher/... ./cmd/vantare/...`
- `pnpm --dir frontend test` y tests focalizados durante el desarrollo.
- `pnpm --dir frontend build`.
- `pnpm --dir frontend lint`, documentando únicamente fallos preexistentes con evidencia.
- `git diff --check`.

### Visual/manual

- Playwright o navegador real con escalas 100 %, 125 %, 150 % y 200 %.
- Verificar inicio, checkpoints, 100 %, salida animada, error y reduced motion.
- Build Wails Windows con el `.env.local` del escritorio y smoke real si el entorno lo permite.
- Confirmar que app conocida, Steam, ejecutable detectado y app manual mantienen sus logos durante el reescaneo.

## Fuera de alcance

- Cambiar discovery, ranking de assets o extracción de iconos ya corregidos en ISA-9.
- Rediseñar tarjetas, perfiles, dock o layout general de Launcher.
- Añadir historial de escaneos, cancelación, ETA o métricas persistentes.
- Añadir una librería de animación o nuevas dependencias.

## Criterios de aceptación

1. Cada entrada real en Launcher inicia exactamente un reescaneo; el arranque del Hub fuera de esa pestaña no lo inicia.
2. La barra A muestra progreso híbrido de 0 a 100 con fases reales y movimiento suave.
3. El 100 % solo se muestra después del éxito confirmado por backend.
4. Las apps y logos existentes permanecen visibles y sin degradación durante el proceso.
5. No hay escaneos concurrentes por navegación o doble clic.
6. Error y reduced motion tienen comportamiento claro y accesible.
7. Tests, build frontend, checks Go y verificaciones visuales aplicables quedan registrados.
8. No se hace merge; Isaac debe probar y aprobar manualmente al 100 % antes de que nada entre en `develop`.
