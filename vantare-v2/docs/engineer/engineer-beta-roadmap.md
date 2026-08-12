# Engineer — roadmap general por fases

Estado: vigente desde ISA-313 / ENG-R01 Fase 5. Linear decide issues,
dependencias, ramas y estados; el handoff vivo registra el estado demostrado.

## Propósito

Engineer acompaña al piloto en directo y sustituye funcionalmente a CrewChief
sin copiar su arquitectura, código, constantes, frases, sonidos, assets o
estructura. Consume únicamente Telemetry Core, funciona offline, calla ante
datos ausentes o stale y mantiene coherentes audio, radio, subtítulos y
overlays.

La primera Beta empieza en español e inglés y cubre las familias planificadas
salvo cambio de piloto. Italiano y portugués brasileño quedan para expansión.
PTT sigue siendo la entrada segura; voz, wake word y acciones solo convergen
cuando superan sus gates.

La fase activa es [Spotter observable](phases/spotter/plan.md). Su aceptación
acumulativa vive en [acceptance.md](phases/spotter/acceptance.md).

## Dependencias comunes

- Nightly, Linear, handoff y capacidades reales reconciliados al entrar.
- Telemetry Core como única fuente de telemetría, calidad y freshness.
- Código propio para hechos, intención, prioridad y acciones críticas.
- Sin dependencia, arquitectura o ampliación material sin revisión de Isaac.
- Kokoro como único TTS Vantare; clips preparados/cacheados para el camino
  inmediato y ninguna síntesis en hot path sin evidencia nueva.
- Contenido, frases, audio y assets propios o licenciados de forma compatible.
- Acciones mutables con propuesta, confirmación, resultado y readback.

## Ciclo de una fase

Al entrar se replantea la fase desde el estado real. Las subfases siguientes
son probables, no microtareas congeladas. Cada corte define un resultado
observable pequeño y conserva el producto compilable. Hasta que nazca la ruta
acumulativa S1 (Corte C), cada corte cierra con sus tests focales + validación
manual; desde que nace, se amplía. Todas las fases y capacidades amplían el
mismo panel de la pestaña Ingeniero y su test UI al entrar (detalle exacto
replanificado por subfase), sin app, ruta, renderer, estado ni lógica paralela
de debug.

El cierre siempre combina:

1. validación manual proporcional sobre aplicación, LMU, Windows, hardware,
   audio o voz cuando sean relevantes;
2. ampliación de la misma aceptación ejecutable y evaluable por IA (test
   frontend/automatizado acumulativo de la pestaña Ingeniero junto al test
   backend aplicable), con salida inequívoca y cobertura de escenarios esperados
   y prohibidos.

Una IA puede dirigir el protocolo y comprobar la evidencia humana, pero no
suplanta juicios de audibilidad, pronunciación, ergonomía o falsas activaciones.

## Fases

### 1. Spotter observable — activa documentalmente

- **Propósito:** primera vertical perceptible de seguridad y tráfico.
- **Dependencias:** autoridades de la vertical actual, señales LMU demostrables
  y contenido ES/EN propio para la salida audible.
- **Subfases probables:** baseline; núcleo lateral; lifecycle; audio/visual;
  multiclase; peligros; cierre LMU/Windows.
- **Resultado:** un mismo hecho fresco produce audio Kokoro preparado/cacheado
  y visual compartido, o una degradación honesta; cada corte es observable y
  comprobable desde la pestaña Ingeniero.
- **Cierre:** escenarios manuales de tráfico y salida real más aceptación
  acumulativa de decisión, timings, audio, visual y lifecycle.

Isaac aceptó humanamente ISA-313 Fase 5 el 2026-08-12. S1 está en replanning
técnico con ISA-327 y rama propia; S1 incorpora ahora el mínimo frontend en la
pestaña Ingeniero para probar lo que incluya (persistencia y rediseño de
preferencias quedan fuera; ISA-314 separada) y requiere nueva aprobación humana
tras esta reconciliación; la implementación no comienza hasta aprobar el
microplan de S1 (cortes A/B/C) en el [plan de fase](phases/spotter/plan.md).
S2/ISA-189, S4/ISA-187 e ISA-314 quedan diferidos expresamente hasta cerrar S1.

### 2. Engineer de carrera

- **Propósito:** ampliar la seguridad inmediata hacia acompañamiento útil.
- **Dependencias:** Spotter estable y capacidades frescas por familia.
- **Subfases probables:** sesión/rivales/ritmo; fuel y Virtual Energy;
  neumáticos/daños; banderas/penalizaciones/pits; relevancia y motivación.
- **Resultado:** mensajes útiles y demostrables para todas las familias Beta
  salvo cambio de piloto.
- **Cierre:** sesión LMU representativa y matriz acumulativa de familias,
  calidad, prioridad, cadencia, cooldowns y salidas.

### 3. Control e interacción

- **Propósito:** configuración persistente, comprensible y segura.
- **Dependencias:** autoridades de producto estables y permisos definidos.
- **Subfases probables:** centro de control; persistencia; PTT/dispositivos;
  personalidades y preferencias.
- **Resultado:** preferencias recuperables, estados honestos y PTT sin captura
  fuera de la intención del usuario.
- **Cierre:** recorrido manual de reinicio y hot-plug más aceptación acumulativa
  de UI, persistencia, permisos y ausencia de efectos inesperados.

### 4. Acciones LMU seguras

- **Propósito:** proponer y ejecutar cambios controlados sin perder evidencia.
- **Dependencias:** comandos, diálogo, capacidades de escritura y readback.
- **Subfases probables:** propuesta/cancelación; Pit Manager; resultados y
  recuperación.
- **Resultado:** ninguna acción cambia LMU sin confirmación y resultado
  verificable; lo indeterminado falla cerrado.
- **Cierre:** pruebas manuales autorizadas en LMU más aceptación de estados,
  idempotencia, fallos parciales y readback.

### 5. Voz offline condicionada — línea paralela

- **Propósito:** voz local sin bloquear Spotter ni fingir disponibilidad.
- **Dependencias:** licencias, corpus consentido, privacidad, hardware y gates
  humanos por locale.
- **Subfases probables:** viabilidad Kokoro; contenido propio; STT sobre PTT;
  wake word condicionado.
- **Resultado:** voz ES/EN donde exista evidencia; PTT y salida visual o
  cache-only siguen como fallback honesto donde no la haya.
- **Cierre:** escucha y reconocimiento humanos más aceptación de lifecycle,
  cancelación, recursos, privacidad y evidencia requerida.

### 6. Strategy y overlays avanzados

- **Propósito:** conectar propuestas y visualización sin duplicar autoridades.
- **Dependencias:** bases de Engineer, acciones seguras y contratos versionados
  de Strategy y Overlay.
- **Subfases probables:** propuestas; aceptación/rechazo; estados versionados;
  visualización y recuperación.
- **Resultado:** Engineer propone y refleja estrategia sin aplicarla de forma
  silenciosa ni crear otro renderer.
- **Cierre:** flujo manual controlado más aceptación de versiones,
  confirmaciones, resultados y paridad visual.

### 7. Beta ES/EN integrada

- **Propósito:** demostrar el compañero de carrera durante sesiones completas.
- **Dependencias:** fases anteriores aplicables y gates de distribución.
- **Subfases probables:** diagnóstico; sesiones largas; reconexión; packaging;
  Windows 10/11; correcciones de testers.
- **Resultado:** Beta instalable, observable y honesta dentro de su alcance.
- **Cierre:** recorrido manual desde instalación a sesión y recuperación, más
  aceptación acumulativa completa de producto, soak, packaging y rollback.

### 8. Expansión posterior

- **Propósito:** ampliar sin reabrir los fundamentos de la Beta.
- **Dependencias:** Beta estable y evidencia propia por idioma o capability.
- **Subfases probables:** italiano/PT-BR; cambio de piloto; otros simuladores;
  nuevas familias; always-on solo si sus gates lo permiten.
- **Resultado:** cada ampliación conserva seguridad y paridad previas.
- **Cierre:** validación real focal y ampliación de la misma aceptación con
  regresión completa del alcance anterior.

## Criterio de transición

Una fase solo termina con resultado observable, evidencia manual y de IA,
límites visibles, review sin bloqueantes y estado coincidente en Linear,
handoff y documentos vivos. La fase siguiente se replantea entonces; este
roadmap no autoriza implementación, promoción ni release por sí mismo.
