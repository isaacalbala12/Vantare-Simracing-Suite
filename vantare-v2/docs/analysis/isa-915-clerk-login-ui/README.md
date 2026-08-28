# Evidencia UI ISA-915: login Clerk

Fecha: 2026-08-28. HEAD de ejecución previo al commit de evidencia:
`bd9311f76c82d10b5adce970de09687d3678cc70`.

## Resultado

`pnpm --dir frontend visual:clerk-login` pasó 15 combinaciones:

- estados `loading`, `signed-out` y `error`;
- viewports 375x812, 414x896, 768x1024, 1024x768 y 1440x900;
- cero overflow horizontal;
- un `main` y un `h1` por vista;
- cero `title` nativo y cero input sin label;
- todos los controles visibles miden al menos 44x44 px;
- navegación por Tab alcanza un control cuando existe;
- consola y red limpias, salvo el aviso de procedencia explícito del mock Wails;
- screenshots y métricas reproducibles en `artifacts/`.

Se revisaron visualmente como mínimo:

- `clerk-login-signed-out-375x812.png`;
- `clerk-login-loading-768x1024.png`;
- `clerk-login-error-1440x900.png`.

No se observó recorte, desalineación, texto ilegible ni jerarquía rota. El foco
visible queda capturado en los controles interactivos.

## Qué demuestra y qué no

El harness importa `LoginScreenView`, la vista productiva real. Solo sustituye
el contenido remoto de `<SignIn>` por un fixture etiquetado y accesible, porque
el proceso de prueba no dispone de una publishable key. Por tanto demuestra el
marco Vantare, sus estados, responsive, foco y límites de integración; no
demuestra que Clerk cargue, autentique o conserve una sesión real.

La comprobación local confirmó:

- Clerk CLI 3.2.0 disponible y autenticado en una ejecución anterior;
- Wails 3 disponible;
- `VITE_CLERK_PUBLISHABLE_KEY` ausente en el proceso actual;
- otra app `vantare-isa912-delay` abierta, que no se cerró ni modificó.

La prueba Wails real queda pendiente hasta que la publishable key esté disponible
para el proceso sin leer, copiar o versionar `.env*`. También requiere que la
configuración remota de Clerk acepte el origen WebView2 y que la frontera de
ISA-909 esté desplegada; navegador, mock Wails y tests no sustituyen esa prueba.

## Repetición

Desde `vantare-v2`:

```powershell
pnpm --dir frontend visual:clerk-login
```

El runner rechaza un puerto 5209 ya ocupado, levanta su propio Vite con el mock
Wails oficial, ejecuta Chromium headless y termina únicamente el proceso que él
creó.
