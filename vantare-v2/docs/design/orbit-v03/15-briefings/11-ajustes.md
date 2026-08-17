# Briefing 11 · Ajustes (`?view=ajustes&settings=…`)

## Objetivo
Portar `SettingsPage.tsx` / `hub/settings` a las cinco secciones Orbit, con la columna contextual como navegación (solo secciones; bloques persistentes ocultos) y el título/lead de la cabecera cambiando por sección.

## Secciones
- **Cuenta**: `acct-hero` (grid `1.3fr 1fr`): tarjeta de identidad (avatar 64 con logo/imagen de la cuenta, nombre, correo enmascarado, badges Plan/Canal/Dispositivo, "Comprobar acceso" y "Cerrar sesión") + tarjeta de **plan** (fondo carmín, nombre 26px, subtítulo, módulos incluidos con ticks según licencia; próximamente en ámbar) → **Sesión** (kv: estado, último acceso, caducidad offline, canales) · **Dispositivos** (este dispositivo activo + otros con "Cerrar").
- **Aplicación**: **Interfaz** (idioma, densidad, tema con 3 muestras, reducir animaciones) · **Sistema** (inicio con Windows, cerrar a la bandeja, notificaciones, unidades `Seg`).
- **Actualizaciones**: `upd-hero` (versión 30px mono, "Stable · comprobado hace n · al día", **Buscar actualizaciones** primary, toggle "Instalar automáticamente al salir") → 3 tarjetas de **canal** (radio: Stable activa; Testers/Nightly con candado si no hay acceso; versión · fecha) → **Novedades** (changelog: versión coral, texto, etiqueta).
- **Atajos**: cabecera (explicación, "Restablecer todos", `SubtleStatus` conflictos) + 4 grupos (`Surface`): Overlay (alternar, perfil siguiente/anterior, modo edición en pista) · Launcher y carrera (lanzar predeterminado, marcar parada, silenciar Ingeniero) · Studio (guardar, deshacer/rehacer, duplicar, área segura) · Global (Comando, mostrar ventana). Filas `KeycapRow` con keycaps físicos; "sin asignar" punteado; conflicto ámbar. **Grabación** de combinación (clic → escuchar `keydown` → asignar/validar conflicto) sobre el contrato real de hotkeys.
- **Diagnóstico**: `StatRow` (Telemetry Core, Overlay, CPU·memoria, Datos locales) → **Datos y registros** (carpeta, registros, muestreo, **Preparar informe**) · **Últimos eventos** (log mono con niveles).

## Criterios de aceptación
- [ ] La columna muestra solo las 5 secciones en Ajustes; navegar entre ellas cambia h2/lead y panel (con `tab-in`).
- [ ] Cambiar densidad aplica al instante y persiste; tema/idioma conectados a la configuración real.
- [ ] Canales bloqueados según licencia con candado; seleccionar canal dispara el flujo real.
- [ ] Atajos: grabar una combinación la muestra en keycaps; conflicto marca ambas filas en ámbar y el estado "n conflictos".
- [ ] Sin scroll de página a 1080 en las 5 secciones. Capturas ≈ `evidence/ajustes-cuenta.png`, `ajustes-actualizaciones.png`, `ajustes-atajos.png`.

## Referencias
`06 § Ajustes`, `04` (KeycapRow, StatTile, Toggle, Seg), `14 settings.*`, `docs/license-service-contract.md`, `docs/branch-channels.md`.
