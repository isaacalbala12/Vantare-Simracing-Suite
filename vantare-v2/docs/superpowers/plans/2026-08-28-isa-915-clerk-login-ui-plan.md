# Plan técnico ISA-915: login Clerk visible

Estado: listo para ejecución. Rama apilada
`vantareapp/isa-915-clerk-login-ui@4751bfa5` sobre ISA-909; `nightly` todavía no
contiene esa dependencia.

## Grafo de ejecución

```text
P0 SDD + baseline
  -> P1 SDK y puente de sesión (TDD)
       -> P2 login + identidad + logout (TDD)
            -> P3 gates frontend
                 -> P4 pruebas UI navegador
                      -> P5 prueba Wails real, si el entorno es viable
```

No se paralelizan cortes sobre esta rama. Cada corte verde se revisa y
commitea antes del siguiente.

## P0 — Contrato y baseline

- Congelar spec, plan y tareas.
- Ejecutar tests actuales de LoginScreen, HubApp, AuthSessionBridge, identidad y
  Settings.
- Confirmar que no existe dependencia Clerk ni configuración versionada.
- Regenerar roadmap y actualizar handoff/issue como trabajo en curso.

Aceptación: baseline exacto y diff solo documental.

## P1 — Provider y puente Clerk

Orden RED-GREEN:

1. Tests de key ausente, loading, signed-out, sesión activa y `getToken` fallido.
2. Añadir `@clerk/react` con pnpm desde la raíz del workspace.
3. Implementar un único módulo `clerk-auth.tsx`.
4. Emitir validación solo con token no vacío y cancelar resultados tardíos.
5. Retirar `AuthSessionBridge` del árbol productivo, sin borrar helpers legacy.

Aceptación: cero almacenamiento propio y una validación por activación.

## P2 — Superficies visibles

- LoginScreen se reduce al marco, estados propios y `<SignIn routing="virtual">`.
- HubApp deja de pasar tokens Supabase desde el formulario eliminado.
- `useAccountIdentity` usa `useUser` con fallback de licencia.
- Settings pide token fresco para comprobar acceso y usa logout Clerk seguido de
  limpieza local.
- Añadir traducciones ES/EN/IT/PT para carga, configuración, error y reintento.

Aceptación: los tests verifican comportamiento observable, no clases internas
del SDK.

## P3 — Gates de código

Desde `vantare-v2`:

```powershell
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend lint
pnpm --dir frontend build
git diff --check
```

Si Go o contratos compartidos cambian inesperadamente, se para antes de ejecutar
un gate que pudiera disfrazar la ampliación de alcance.

## P4 — Protocolo UI navegador

- Harness aislado que renderiza la superficie real con un adaptador Clerk de
  pruebas determinista; no contiene usuarios ni tokens.
- Viewports: 375x812, 414x896, 768x1024, 1024x768 y 1440x900.
- Comprobar: sin scroll horizontal, contenido visible con scroll vertical,
  teclado y foco, targets de al menos 44 px, contraste/labels, consola sin
  errores y peticiones limitadas a assets locales.
- Capturar `loading`, `signed-out` y `error`.

El harness prueba layout y estados. No demuestra autenticación Clerk real.

## P5 — Wails real

Con publishable key local ya configurada y sin inspeccionar `.env*`:

1. arrancar la app Wails de esta rama;
2. verificar que carga el componente Clerk y completar un login de prueba con
   intervención del usuario si es necesaria;
3. observar `license:validate`, `license:changed`, consola y red sin registrar
   el JWT;
4. cerrar sesión y confirmar retorno al login;
5. cerrar/reabrir para comprobar persistencia WebView2 si el entorno lo permite.

Si la app remota de Clerk o ISA-909 no están desplegadas, se documenta el bloqueo
y no se presenta el harness como sustituto.

## Rollback

Revertir el commit de ISA-915 restaura LoginScreen/AuthSessionBridge Supabase y
retira `@clerk/react`. No requiere rollback de datos ni servidor. Ningún cambio
se integra o despliega en este plan sin otra autorización.
