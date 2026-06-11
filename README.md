# Vantare Overlays

<div align="center">

**Overlays profesionales de simracing para streaming y configuraciones multi-monitor.**

Un competidor moderno y multi-sim de RaceLabs con soporte para iRacing, Le Mans Ultimate y Assetto Corsa.

[![License](https://img.shields.io/badge/license-proprietary-red.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/vantare/overlays/releases)
[![Discord](https://img.shields.io/badge/discord-join-7289da.svg)](https://discord.gg/vantare)

</div>

---

## Descripción

Vantare Overlays es una aplicación de escritorio diseñada para simracers profesionales y entusiastas que buscan overlays de alta calidad para sus transmiones en vivo y configuraciones de monitores múltiples. Construida con tecnologías web modernas (React, TypeScript, Vite), ofrece una alternativa potente y personalizable a soluciones existentes como RaceLabs.

La aplicación funciona como un proceso de fondo que captura telemetría en tiempo real desde los simuladores compatibles y la muestra en overlays transparentes que pueden integrarse perfectamente en OBS Studio mediante Browser Sources, o ejecutarse en ventanas Electron dedicadas para monitores secundarios.

### ¿Por qué Vantare Overlays?

- **Multi-sim nativo**: Soporte completo para iRacing, Le Mans Ultimate (LMU) y Assetto Corsa (AC), con arquitectura extensible para futuros simuladores.
- **Diseñado para streamers**: Alerts automáticos de adelantamientos, pole positions y vueltas más rápidas, perfectos para transmiones en vivo.
- **Personalización total**: Sistema de temas completo con opciones predefinidas (Dark, Blood, Midnight) y la capacidad de crear temas personalizados.
- **Rendimiento**: Captura de telemetría a 16Hz con mínimo impacto en el rendimiento del simulador.
- **Multi-monitor**: Ventanas Electron independientes que pueden posicionarse en cualquier monitor de la configuración.

---

## Características Principales

### 🏎️ Multi-sim Support

Soporte nativo para los tres principales simuladores de carreras:

| Simulador | Estado | Telemetría |
|---|---|---|
| **iRacing** | ✅ Completo | iRacing SDK (iRSDK) |
| **Le Mans Ultimate** | ✅ Completo | UDP Telemetry |
| **Assetto Corsa** | ✅ Completo | Shared Memory |
| **AC Evo** | 🔜 Próximamente | (cuando esté disponible) |

Cada simulador implementa un adaptador de telemetría que normaliza los datos en un formato unificado, permitiendo que los overlays funcionen sin importar qué simulador esté activo.

### 📺 OBS Browser Source + Multi-monitor

- **Browser Source**: Los overlays se pueden cargar directamente en OBS Studio como Browser Sources, manteniendo la transparencia y la integridad visual.
- **Ventanas Electron**: Para configuraciones multi-monitor, cada overlay puede ejecutarse como una ventana Electron independiente que se puede posicionar en cualquier pantalla.
- **Resolución adaptable**: Los overlays se adaptan automáticamente a la resolución y escala del monitor donde se renderizan.

### 🎨 Full Theme System

Sistema de temas completo que permite personalizar cada aspecto visual de los overlays:

- **Dark**: Tema oscuro por defecto, ideal para la mayoría de setups.
- **Blood**: Tema rojo oscuro con acentos agresivos, perfecto para streams de carreras de resistencia.
- **Midnight**: Tema azul oscuro con toques de neón, estilo cyberpunk.
- **Custom**: Crea tus propios temas personalizando colores, fuentes, bordes y efectos.

Los temas se pueden cambiar en tiempo real sin reiniciar la aplicación.

### ⚡ Real-time Telemetry

- Captura de telemetría a **16Hz** (16 actualizaciones por segundo).
- Datos normalizados en un formato unificado (`UnifiedTelemetryData`) que incluye:
  - Posición, velocidad, RPM, marcha
  - Tiempos de vuelta (actual, mejor, predicción)
  - Estado del piloto (en boxes, penalizaciones, DRS)
  - Información de la sesión (tipo, duración, clima)
  - Datos de otros coches (para overlays de relative y standings)

### 🎬 Stream Alerts

Sistema de alertas automáticas diseñado para streamers:

- **Overtake Alerts**: Notificación cuando un coche adelanta a otro.
- **Pole Position**: Alerta al lograr la pole position en clasificación.
- **Fastest Lap**: Notificación al completar la vuelta más rápida de la sesión.
- **Personalización**: Configura duración, posición, estilo visual y sonido de cada alerta.

### 👥 Profile Management

- Crea y gestiona múltiples perfiles de configuración.
- Cambia rápidamente entre configuraciones de overlays para diferentes escenarios (práctica, clasificación, carrera).
- Sincroniza perfiles en la nube con tu cuenta de Vantare (opcional).

### 🔐 Freemium Licensing

Modelo de licenciamiento escalonado:

| Plan | Overlays | Themes | Alerts | Precio |
|---|---|---|---|---|
| **Free** | 2 | 1 | ❌ | Gratis |
| **Pro** | Todos | Todos | ✅ | $9.99/mes |
| **Ultimate** | Todos | Todos + Custom | ✅ | $19.99/mes |

---

## Overlays v1

### Standings

Overlay completo de clasificación de carrera que muestra:

- **Posiciones**: Clasificación actual de todos los pilotos en la sesión.
- **Gaps**: Tiempo de diferencia entre pilotos consecutivos.
- **Pit Status**: Indicador visual de qué pilotos están en boxes.
- **iRating**: Rating de iRacing de cada piloto (cuando disponible).
- **Team Names**: Nombre del equipo de cada piloto.
- **Country Flags**: Banderas de nacionalidad de cada piloto.
- **In/Out**: Indicador de si el piloto está dentro o fuera de la sesión.

**Estilo visual**: Tabla compacta con filas alternas de colores para fácil lectura durante la acción.

### Relative

Muestra los coches cercanos al piloto actual con tiempos de diferencia interpolados:

- **Coche actual**: Resaltado con un color distintivo.
- **Posiciones**: Posición relativa de cada coche en la carrera.
- **Gaps**: Tiempo de diferencia con interpolación precisa.
- **Color coding**: Los coches por delante se muestran en verde, los de atrás en rojo.
- **Nombre del piloto**: Identificación clara de cada coche.

**Uso ideal**: Essencial para la estrategia de carrera, permite ver rápidamente qué coches están cerca y cuánto tiempo tienes hasta el siguiente adelantamiento.

### Delta Bar

Barra de delta en tiempo real que compara tu vuelta actual con tu mejor vuelta:

- **Delta actual**: Diferencia de tiempo en tiempo real.
- **Predicción**: Tiempo estimado de vuelta al ritmo actual.
- **Barra visual**: Barra que se mueve hacia la izquierda (más rápido) o derecha (más lento).
- **Segmentos de trazado**: Delta por sectores del trazado.
- **Historial**: Gráfico de las últimas vueltas con sus deltas.

**Precisión**: Actualización a 16Hz para una retroalimentación instantánea al piloto.

### Stream Alerts

Sistema de alertas automáticas para transmiones en vivo:

- **Overtake Alerts**: Notificación animada cuando se produce un adelantamiento.
- **Pole Position**: Alerta especial al lograr la pole position.
- **Fastest Lap**: Notificación al completar la vuelta más rápida.
- **Custom Alerts**: Crea tus propias alertas con condiciones personalizadas.
- **Sound**: Opcionalmente, sonidos de alerta personalizados.
- **Positioning**: Configura la posición de las alertas en pantalla.

---

## Screenshots

> **PLACEHOLDER**: Las capturas de pantalla se agregarán próximamente. Puedes ver el estado actual de desarrollo ejecutando la aplicación en modo desarrollo.

```
Capturas planificadas:
- Dashboard principal con todos los overlays activos
- Standings en modo carrera
- Relative durante una secuencia de adelantamientos
- Stream Alerts en acción
- Selector de temas
- Configuración de overlays
```

---

## Instalación

### Requisitos del Sistema

- **Sistema Operativo**: Windows 10 o Windows 11 (64-bit)
- **RAM**: Mínimo 4 GB, recomendado 8 GB
- **Disco**: 200 MB de espacio disponible
- **Simulador**: Al menos uno de los siguientes:
  - iRacing (suscripción activa)
  - Le Mans Ultimate
  - Assetto Corsa
- **Optional**: OBS Studio (para integración con Browser Source)

### Descargar

Descarga la última versión desde la página de [Releases](https://github.com/vantare/overlays/releases).

1. Descarga el archivo `.exe` de la última versión.
2. Ejecuta el instalador.
3. Sigue las instrucciones del asistente de instalación.
4. Inicia Vantare Overlays desde el menú de inicio o el acceso directo del escritorio.

### Configuración Inicial

1. **Selecciona tu simulador**: Al iniciar por primera vez, selecciona el simulador que utilizarás.
2. **Inicia el simulador**: Abre tu simulador favorito (iRacing, LMU o AC).
3. **Activa los overlays**: Los overlays se detectarán automáticamente cuando el simulador esté ejecutándose.
4. **Configura OBS** (opcional): Agrega los overlays como Browser Sources en OBS Studio.

### Desarrollo

Para desarrolladores que quieran contribuir o ejecutar la aplicación en modo desarrollo:

### v2 (Go — reinicio activo)

El scaffold v2 vive en [`vantare-v2/`](vantare-v2/). Requiere [Go 1.22+](https://go.dev/dl/).

```bash
cd vantare-v2
go test ./...
go run ./cmd/lmu-debug -mock -once
```

Ver [`vantare-v2/README.md`](vantare-v2/README.md) y [`docs/V2-STACK-AND-PERFORMANCE.md`](docs/V2-STACK-AND-PERFORMANCE.md).

### v1 (Electron — legado)

```bash
# Clonar el repositorio
git clone https://github.com/vantare/overlays.git
cd vantare-overlays

# Instalar dependencias
pnpm install

# Iniciar modo desarrollo
pnpm dev

# Ejecutar tests
pnpm test

# Build de producción
pnpm build

# Empaquetar como .exe
pnpm package
```

**Nota**: Se requiere [pnpm](https://pnpm.io/) como gestor de paquetes. No se admite npm o yarn.

---

## Estructura del Proyecto

Vantare Overlays está construido como un **monorepo** utilizando [Turborepo](https://turbo.build/) y [pnpm](https://pnpm.io/) para gestionar múltiples paquetes y aplicaciones.

```
vantare-overlays/
├── apps/
│   ├── desktop/              # Aplicación Electron principal
│   │   ├── src/
│   │   │   ├── main/         # Proceso principal de Electron
│   │   │   ├── preload/      # Scripts de preload
│   │   │   └── renderer/     # Proceso de renderizado
│   │   ├── electron-builder.yml
│   │   └── package.json
│   │
│   └── overlay-app/          # Aplicación web standalone
│       ├── src/
│       ├── index.html
│       └── package.json
│
├── packages/
│   ├── @vantare/
│   │   ├── sim-core/         # Telemetría tipos + adaptadores
│   │   │   ├── src/
│   │   │   │   ├── adapters/     # Adaptadores por simulador
│   │   │   │   │   ├── iracing.ts
│   │   │   │   │   ├── lmu.ts
│   │   │   │   │   └── assetto-corsa.ts
│   │   │   │   ├── types/        # Tipos de telemetría
│   │   │   │   └── index.ts
│   │   │   └── package.json
│   │   │
│   │   ├── ui-core/          # Componentes React compartidos
│   │   │   ├── src/
│   │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   └── index.ts
│   │   │   └── package.json
│   │   │
│   │   ├── auth/             # Autenticación con Supabase
│   │   │   ├── src/
│   │   │   └── package.json
│   │   │
│   │   └── types/            # Tipos públicos
│   │       ├── src/
│   │       └── package.json
│   │
│   └── ui/                   # Paquete de UI adicional
│       ├── src/
│       └── package.json
│
├── shared/
│   └── types/                # Tipos del puente IPC
│       ├── ipc.ts
│       └── telemetry.ts
│
├── docs/                     # Documentación del proyecto
│   ├── ARCHITECTURE.md
│   ├── TECH-DECISIONS.md
│   ├── OVERLAY-DEV-GUIDE.md
│   ├── SIM-ADAPTER-GUIDE.md
│   ├── THEME-SYSTEM.md
│   ├── AUTH-GUIDE.md
│   ├── IPC-BRIDGE.md
│   └── ROADMAP.md
│
├── turbo.json                # Configuración de Turborepo
├── pnpm-workspace.yaml       # Workspace de pnpm
├── tsconfig.base.json        # Configuración base de TypeScript
├── vite.config.ts            # Configuración de Vite
└── package.json              # Paquete raíz
```

### Arquitectura de Paquetes

| Paquete | Descripción | Dependencias |
|---|---|---|
| `@vantare/sim-core` | Adaptadores de telemetría y tipos unificados | `@vantare/types` |
| `@vantare/ui-core` | Componentes React compartidos para overlays | React, Tailwind CSS |
| `@vantare/auth` | Autenticación y manejo de sesiones | Supabase |
| `@vantare/types` | Tipos públicos y definiciones | TypeScript |
| `shared/types` | Tipos del puente IPC entre procesos | Ninguna |

---

## Stack Tecnológico

| Componente | Tecnología | Versión | Propósito |
|---|---|---|---|
| **Desktop** | Electron | ^33.0.0 | Aplicación de escritorio multiplataforma |
| **Desktop Builder** | Electron Builder | ^25.0.0 | Empaquetado y distribución |
| **Frontend** | React | ^19.0.0 | UI de los overlays |
| **Lenguaje** | TypeScript | ^5.7.0 | Tipado estático |
| **Build** | Vite | ^6.0.0 | Bundler y dev server |
| **CSS** | Tailwind CSS | ^4.2.0 | Estilos utilitarios |
| **State** | Zustand | ^5.0.0 | Gestión de estado |
| **Monorepo** | Turborepo | ^2.3.0 | Build system monorepo |
| **Paquetes** | pnpm | ^9.0.0 | Gestor de paquetes |
| **Testing** | Vitest | ^3.0.0 | Unit tests |
| **E2E** | Playwright | ^1.49.0 | Tests end-to-end |
| **Auth** | Supabase | ^2.45.0 | Autenticación y backend |
| **Distribución** | GitHub Releases | - | Distribución de versiones |

### Por qué estas tecnologías?

- **Electron**: Permite crear una aplicación de escritorio con tecnologías web, facilitando el desarrollo y la distribución en Windows.
- **React 19**: La última versión de React con mejoras de rendimiento y nuevas APIs como Server Components (aunque no se usan aquí, la base está preparada).
- **Vite**: Bundler ultrarrápido con soporte nativo para TypeScript y HMR (Hot Module Replacement) para un desarrollo eficiente.
- **Tailwind CSS v4**: Framework CSS utilitario que permite crear interfaces complejas con clases predefinidas, manteniendo el CSS mínimo y personalizable.
- **Zustand**: Alternativa ligera y simple a Redux para la gestión de estado, ideal para la telemetría en tiempo real que cambia constantemente.
- **Turborepo**: Optimiza los builds en el monorepo con caching y ejecución paralela.
- **Supabase**: Backend como servicio para autenticación, bases de datos y almacenamiento, sin necesidad de gestionar servidores.

---

## Overlays Disponibles (v1)

### Standings

**Descripción**: Overlay completo de clasificación de carrera.

**Características**:
- Posiciones de carrera en tiempo real
- Tiempos de diferencia entre pilotos
- Estado de boxes (quién está entrando/saliendo)
- iRating de cada piloto (cuando disponible)
- Nombre del equipo
- Banderas de nacionalidad
- Indicador de estado (activo/inactivo)

**Estilo**: Tabla compacta con filas alternas de colores para fácil lectura durante la acción de carrera.

**Uso recomendado**: Esquina superior derecha del stream, o monitor secundario dedicado.

---

### Relative

**Descripción**: Muestra los coches cercanos al piloto actual.

**Características**:
- Coche actual resaltado con color distintivo
- Posiciones relativas de coches cercanos
- Tiempos de diferencia interpolados
- Color coding (verde = delante, rojo = detrás)
- Nombre del piloto y número de coche

**Uso recomendado**: Parte inferior de la pantalla, o como overlay pequeño en el stream.

---

### Delta Bar

**Descripción**: Barra de delta en tiempo real comparando la vuelta actual con la mejor vuelta.

**Características**:
- Delta actual con precisión de centésimas
- Predicción de tiempo de vuelta al ritmo actual
- Barra visual con movimiento fluido
- Segmentos de trazado (sectores)
- Historial de últimas vueltas

**Uso recomendado**: Parte superior de la pantalla, centrada o a la izquierda.

---

### Stream Alerts

**Descripción**: Sistema de alertas automáticas para transmiones en vivo.

**Características**:
- Alertas de adelantamiento (overtake)
- Alertas de pole position
- Alertas de vuelta más rápida
- Alertas personalizables
- Sonidos opcionales
- Posición configurable en pantalla

**Uso recomendado**: Centro de la pantalla, con transparencia para no obstructar la acción.

---

## Planes de Desarrollo

Ver [ROADMAP.md](docs/ROADMAP.md) para el plan completo de desarrollo.

### Fase 1: Core (Completada)

- [x] Arquitectura base del monorepo
- [x] Adaptadores de telemetría (iRacing, LMU, AC)
- [x] Overlay Standings
- [x] Overlay Relative
- [x] Overlay Delta Bar
- [x] Sistema de temas
- [x] Integración con OBS Browser Source

### Fase 2: Stream (Completada)

- [x] Stream Alerts (overtake, pole, fastest lap)
- [x] Configuración de alerts
- [x] Sonidos de alerta
- [x] Overlay de datos de sesión

### Fase 3: Advanced (Próximamente)

- [ ] Track Map overlay
- [ ] Input Telemetry overlay
- [ ] Data Blocks (80+ widgets modulares)
- [ ] Sistema de plugins

### Fase 4: Expansion (Futuro)

- [ ] Soporte para AC Evo (cuando esté disponible)
- [ ] Soporte para otros simuladores
- [ ] Marketplace de temas
- [ ] Colaboración en tiempo real
- [ ] Análisis de datos post-carrera

---

## Documentación

La documentación completa del proyecto está disponible en la carpeta `docs/`:

| Documento | Descripción |
|---|---|
| [**V2 Stack & Performance**](docs/V2-STACK-AND-PERFORMANCE.md) | **Stack confirmado v2 (Go+Wails+React), arquitectura y optimizaciones** |
| [Architecture](docs/ARCHITECTURE.md) | Arquitectura general del sistema y decisiones de diseño (v1 Electron) |
| [Technical Decisions](docs/TECH-DECISIONS.md) | Decisiones técnicas y justificaciones |
| [Overlay Development Guide](docs/OVERLAY-DEV-GUIDE.md) | Guía para desarrollar nuevos overlays |
| [Sim Adapter Guide](docs/SIM-ADAPTER-GUIDE.md) | Guía para crear adaptadores de telemetría |
| [Theme System](docs/THEME-SYSTEM.md) | Documentación del sistema de temas |
| [Auth & Licensing](docs/AUTH-GUIDE.md) | Guía de autenticación y licenciamiento |
| [IPC Bridge](docs/IPC-BRIDGE.md) | Documentación del puente IPC entre procesos |
| [Roadmap](docs/ROADMAP.md) | Plan de desarrollo y próximas funcionalidades |

---

## Contributing

Las contribuciones son bienvenidas. Por favor, lee el [CONTRIBUTING.md](CONTRIBUTING.md) antes de enviar un Pull Request.

### Guía Rápida

1. Haz fork del repositorio.
2. Crea una rama para tu feature (`git checkout -b feature/mi-nueva-funcionalidad`).
3. Haz commit de tus cambios (`git commit -m 'Add mi nueva funcionalidad'`).
4. Push a la rama (`git push origin feature/mi-nueva-funcionalidad`).
5. Abre un Pull Request.

### Convenciones

- **Commits**: Sigue [Conventional Commits](https://www.conventionalcommits.org/).
- **Code Style**: Usa ESLint y Prettier (se ejecutan automáticamente con Husky).
- **Tests**: Añade tests para nuevas funcionalidades.
- **Docs**: Actualiza la documentación si es necesario.

---

## Licencia

**Proprietary - All rights reserved.**

Este software es propietario y está protegido por las leyes de derechos de autor. No está permitido copiar, modificar, distribuir o vender este software sin la autorización expresa del titular de los derechos de autor.

Para más información sobre licencias comerciales, contacta con el equipo de desarrollo.

---

## Contact

- **Discord**: [Únete al servidor de Discord](https://discord.gg/vantare)
- **Website**: [vantare.com](https://vantare.com)
- **Email**: contact@vantare.com
- **GitHub**: [github.com/vantare/overlays](https://github.com/vantare/overlays)

---

## Agradecimientos

Gracias a la comunidad de simracing por su apoyo y feedback continuo.

Especialmente a:
- Los testers beta que ayudaron a pulir los overlays
- La comunidad de Discord por sus sugerencias
- Los desarrolladores de los simuladores compatibles por documentar sus APIs de telemetría

---

<div align-center>

**Hecho con ❤️ para la comunidad de simracing**

</div>
