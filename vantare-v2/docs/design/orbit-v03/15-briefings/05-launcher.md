# Briefing 05 · Launcher (`?view=launcher`)

## Objetivo
Portar `LauncherPage.tsx` y `hub/launcher/*` a Orbit sobre el contrato real (`launcher-contract.ts`: `LauncherApp`, `LaunchProfile`, `LaunchStep`, `LaunchPolicy`).

## Estructura
- Cabecera: eyebrow "Aplicaciones y cadenas", h2 "Launcher", lead; `SubtleStatus` del estado de detección; topbar con "Buscar aplicaciones".
- `StatRow`: Aplicaciones (n en catálogo · m detectadas) · Perfiles (n cadenas · predeterminado · favoritos) · Última ejecución (fecha o —) · Atajo global (kbd desde hotkeys reales).
- Grid `390px | 1fr`: **Aplicaciones** (`Surface`; `ListRow` con `Monogram` 39 usando `gradientFrom/To` del contrato, nombre, categoría · método, estado `Chip` Catálogo/Detectada/Instalada; `Note` de estado neutral debajo) · **Perfiles** (columna: tarjeta `featured` para el predeterminado/favorito con `Monogram` 46, eyebrow, h4 18px, descripción, editar, **▶ Lanzar** primary; cadena de `chain-step` (monograma 26 + nombre + espera) conectados por línea y puntos; políticas como `Chip capability`; segunda tarjeta ghost; tarjeta punteada "Crear perfil").
- Columna contextual: eyebrow "Perfiles" (2) con `ListRow` + ▶; eyebrow "Catálogo" (n · m detectadas) + hint. El bloque persistente Launcher se oculta aquí.

## Comportamiento
- ▶ lanza la cadena real; el estado por paso (pending/launching/ready/failed) se muestra en el `chain-step` (color del punto/etiqueta) — definir con el equipo, mínimo: punto verde/ámbar/rojo.
- Detección real actualiza el estado de cada app y el stat.

## Criterios de aceptación
- [ ] Monogramas con los gradientes del contrato; apps no detectadas muestran "Catálogo".
- [ ] La cadena muestra el orden y las esperas reales del perfil; políticas correctas (reutilizar/reiniciar · reintentar ×n/detener · dejar abiertas/cerrar lanzadas).
- [ ] Sin scroll de página a 1080; a 900 la lista de perfiles se desplaza dentro.
- [ ] Captura ≈ `evidence/launcher.png`.

## Referencias
`06 § Launcher`, `04` (Monogram, ListRow, StatTile), `14 launcher.*`, `docs/launcher-v3-architecture.md`.
