# Incidencias conocidas (Known Issues) - Beta Publica v0.1.0.x

> **Nota**: la version `v0.1.0.0` fue publicada sin `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en la build de release. El login con Google OAuth no funciona en esa build. El hotfix `v0.1.0.1` esta en preparacion para corregirlo. **No uses `v0.1.0.0`** para login; espera a `v0.1.0.1` o build de desarrollo local con env vars.

Este documento contiene la lista oficial de problemas conocidos, limitaciones del alcance y comportamientos esperados en la linea **v0.1.x** de **Vantare Suite**. Revisa esta lista antes de reportar un fallo en Discord.

---

## 0. Widgets: estados de madurez

- **stable**: Relative, Standings, Delta. Listos para uso general con datos live LMU.
- **tester**: Pedals, Ingeniero notifications. Funcionales, pueden tener cambios.
- **experimental**: Track Map, Input Telemetry/Trace. No disponibles.

---

## 1. Incidencias por severidad

### Bloqueantes

- **Login Google OAuth roto en v0.1.0.0 (release empaquetada)**
  - *Sintoma*: al abrir la build empaquetada `v0.1.0.0`, el login con Google falla porque `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` no se inyectaron en CI.
  - *Causa*: falta de secrets `VITE_SUPABASE_*` en GitHub Actions al ejecutar `release.yml`.
  - *Solucion*: **no uses la build v0.1.0.0 para login**. Espera al hotfix `v0.1.0.1` que inyecta las env vars correctamente. Para desarrollo local, copia `.env.example` a `.env` con las credenciales reales.

### Importantes

- **Advertencia de SmartScreen (ejecutable no firmado)**
  - *Sintoma*: Windows Defender o SmartScreen pueden bloquear `vantare.exe` o `vantare-amd64-installer.exe` con una pantalla roja/azul de advertencia.
  - *Causa*: los ejecutables de la fase Beta Publica no cuentan con firma digital comercial (Authenticode).
  - *Solucion*: pulsa **"Mas informacion"** -> **"Ejecutar de todas formas"**. Verifica ademas el SHA256 publicado en `#beta-downloads` contra tu descarga con `certutil -hashfile` o `Get-FileHash`. La firma se implementara antes del release estable v1.0.

- **Ingeniero en vivo con LMU pendiente**
  - *Sintoma*: el spotter del Ingeniero no reacciona a datos en tiempo real mientras conduces en LMU.
  - *Causa*: el adaptador para leer el buffer en vivo de LMU esta pendiente de una fase posterior.
  - *Solucion*: prueba Ingeniero usando el reproductor de simulacion/replay interno del Hub.

- **Login obligatorio con Google OAuth**
  - *Sintoma*: la app no arranca en modo utilizable sin haber iniciado sesion con Google. No hay inicio de sesion anonimo.
  - *Causa*: decision de producto para la beta publica. El gating por licencia requiere identidad. Google OAuth es el acceso minimo obligatorio y aparece como boton principal en la pantalla de login; email/password y Discord siguen disponibles como opciones secundarias.
  - *Solucion*: inicia sesion con tu cuenta de Google desde la pantalla de bienvenida. Si tu cuenta no tiene plan activo, el Hub muestra `PaywallScreen` con los planes `free`, `paid` (Overlays o Engineer) y `suite`. La seccion `Cuenta` en Ajustes refleja tu estado actual (`Activo`, `Periodo de gracia`, `Bloqueado`, `Sin suscripcion`, `Sin sesion`) y tus entitlements (`overlays`, `engineer`, `bundle`, etc.). El boton `Cerrar sesion` siempre devuelve al gate.

- **Atajos globales inactivos en carrera (privilegios UAC)**
  - *Sintoma*: las hotkeys globales (p. ej. `Ctrl+Shift+V`) no responden mientras estas en pista en LMU, aunque funcionan en el escritorio con el Hub activo.
  - *Causa*: LMU se ejecuta como Administrador y Vantare con permisos normales. Windows impide que procesos de menor integridad capturen teclado de procesos elevados.
  - *Solucion*: cierra Vantare y vuelvela a abrir como Administrador (clic derecho -> Ejecutar como administrador).

- **Licencia en periodo de gracia 24h**
  - *Sintoma*: el Hub muestra una franja roja `Licencia en periodo de gracia hasta <fecha>` aunque tu ultima suscripcion sigue activa.
  - *Causa*: el servicio Go no pudo validar contra Supabase en el ultimo ciclo (red caida, supabase caido, build sin env vars). El cache local mantiene los entitlements durante 24h desde la ultima validacion exitosa; pasado ese plazo, el estado pasa a `expired` y se muestra paywall.
  - *Solucion*: si la franja persiste mas de una sesion, reinicia Vantare para forzar una nueva validacion online. Si Supabase sigue sin responder, la app sigue funcionando con el cache de 24h.

- **Pago en linea no embebido en la beta**
  - *Sintoma*: el boton `Suscribirse` del paywall muestra `Pago en linea proximamente para el plan X. El alta y renovacion se haran desde el portal externo de Vantare cuando este activo para la beta publica.`
  - *Causa*: el portal externo de Stripe todavia no esta conectado al binario empaquetado de la beta; el webhook ya esta listo y mapea `price_id -> product_key[]` desde `PRICE_ID_TO_PRODUCT_KEYS`.
  - *Solucion*: el mapeo se valida end-to-end con `deno test` contra `supabase/functions/stripe-webhook/index.test.ts`. Cuando el portal este activo, el handler `handleSubscribe` de `PaywallScreen.tsx` sera el unico punto a tocar.

### Menores

- **Confusion con la columna `Gap` en Practica/Qualy (Standings)**
  - *Sintoma*: durante sesiones de practica o clasificacion, la columna `gap` puede mostrar tiempos de vuelta por logica legacy.
  - *Solucion*: distingue entre `gap` y `bestLap` activando ambas columnas en WidgetStudio para verlas lado a lado.

- **Densidad visual en widgets pequenos**
  - *Sintoma*: si activas muchas columnas opcionales en widgets con tamano fisico muy reducido en LayoutStudio, los textos pueden superponerse.
  - *Solucion*: aumenta el tamano del widget en LayoutStudio o activa la opcion "Recorte de nombre" en la variante dentro de WidgetStudio.

- **Atajo global no responde (colision de registro)**
  - *Sintoma*: una hotkey configurada en Ajustes no responde o genera aviso en logs al iniciar.
  - *Causa*: otra aplicacion en segundo plano (Discord, OBS Studio, Steam, software de GPU, etc.) registro esa misma combinacion con Windows.
  - *Solucion*: entra a **Ajustes** del Hub, cambia la combinacion (anade `Alt` o cambia la letra) y pulsa **Guardar atajos**.

- **Delta best live pendiente de validacion prolongada con LMU real**
  - *Sintoma*: el widget Delta usa el delta nativo de LMU cuando esta disponible, pero esta build aun necesita validacion prolongada en pista con distintos estados de sesion.
  - *Solucion*: si pruebas LMU live, confirma que los negativos aparecen en verde al mejorar y los positivos en rojo al perder tiempo.

- **Autoupdater: releases sin checksum no instalables desde la app**
  - *Sintoma*: si una GitHub Release no incluye el sidecar `.sha256`, el updater rechaza la instalacion.
  - *Causa*: la beta exige verificacion SHA256 antes de ejecutar un instalador descargado por la app.
  - *Solucion*: usa releases que incluyan `.sha256`. Si una release no lo incluye, descarga manualmente desde `#beta-downloads` y verifica el hash con `certutil -hashfile`.

- **Autoupdater: smoke de integracion contra release real pendiente**
  - *Sintoma*: el updater se probo en entorno controlado, pero no se ha ejecutado una validacion completa desde un tester externo descargando una release publica.
  - *Solucion*: si encuentras errores al actualizar desde la app, reportalo en `#beta-bug-reports`.

---

## 2. Limitaciones de diseno y alcance (fuera de scope)

Los siguientes comportamientos son **decisiones de diseno intencionadas** o caracteristicas planificadas para fases posteriores. **No deben reportarse como fallos**:

1. **Sin audio/voces en el Ingeniero**: el spotter no emite sonidos ni TTS. Las alertas son visuales y textuales.
2. **Widget Pedals incompleto**: el widget actual es estetico; su calibracion completa se realizara en una fase posterior.
3. **Exclusividad de Le Mans Ultimate**: la suite esta optimizada solo para la Shared Memory de LMU. No hay soporte en esta fase para iRacing, Assetto Corsa, rFactor 2 u otros.
4. **OBS por LAN (doble PC)**: la integracion con OBS funciona de manera local en el mismo PC. La optimizacion de red para doble PC queda para mas adelante (configuracion manual posible).
5. **Sin pagos en la app**: la compra de `paid` y `suite` se hace desde el portal de pagos externo; en la app solo ves el estado y el enlace.
6. **Sin firma de codigo Authenticode**: los ejecutables no estan firmados digitalmente. Windows SmartScreen mostrara advertencia. La firma se implementara antes del release estable v1.0.
7. **Widget Track Map y Input Telemetry/Trace**: experimentales, no disponibles para testers.
8. **No release por commit**: solo se publica una GitHub Release cuando hay un tag `v*` que cumple el checklist del runbook.
9. **Galeria de disenos de widgets**: incluida en esta build como catalogo de disenos oficiales de solo lectura. Aplica apariencia y variante a los widgets `Relative`, `Standings`, `Delta` y `Pedals` desde WidgetStudio. No modifica `position` ni `tamano` y no crea archivos. Marketplace, cloud sync y compartir disenos quedan fuera de alcance de la beta.
10. **Email/password y Discord OAuth**: disponibles como accesos secundarios del login; Google sigue siendo el camino principal y minimo obligatorio. Si encuentras un error reproducible con cualquiera de los tres accesos, reportalo en `#beta-bug-reports`.