# ISA-1063 — propuesta navegable de Strategy registrado

Base `609a4390`; rama `vantareapp/isa-1063-strategy-prototype`. Autorización de Isaac para continuar hasta una decisión de producto real. Esta entrega prepara la revisión visual exigida en #1028; no sustituye la aplicación.

Abrir `index.html` en un navegador. No necesita instalación, servidor, red ni dependencias. Los cambios de esta propuesta permanecen en memoria y desaparecen al recargar.

## Qué revisar

Siete pasos: inicio Manual/Automático, simulador, evento, combinación, reglas, pilotos, fuentes. Después una pantalla con resumen de carrera/datos, selección de fuente reversible, revisión avanzada y espacio reservado para el resultado. Volver a editar configuración conserva los valores del borrador.

Decisión de producto pendiente: aceptar o ajustar esta composición y densidad antes de construir la UI productiva. Asistente más pantalla ya está aprobado; no se solicita reaprobar esa decisión.

## Alcance y límites visibles

Solo dos combinaciones reales del banco #1030. La entrada Automático muestra el concepto de fuentes conocidas; no escanea carpetas. Calendario, añadir relevos, guardar y calcular están deshabilitados o descritos como pendientes. Reglas avanzadas aparecen como contenido a completar, no con defaults inventados. No hay solver, API, SQL, archivos originales ni persistencia. La copia es una preferencia demostrativa y no copia nada.

Las observaciones mostradas son los agregados contrastados en Imola y Algarve; no se muestran predicciones ficticias. Los tiempos son del reloj de eventos, no tiempos de carrera del nuevo borrador. Las condiciones y piloto escritos durante la prueba son configuración de demostración, no telemetría.

Este HTML es descartable tras la decisión visual. La implementación futura usa componentes productivos y Analysis/Strategy existentes; no se crea un renderer paralelo.

## Verificación personal

- Sintaxis JavaScript `node --check`: PASS.
- Chrome real: recorrido Manual de los siete pasos; duración 60 minutos y piloto de revisión conservados hasta la pantalla.
- Excluir fuente cambia el estado y el bloqueo; Deshacer restaura selección. Revisión de datos muestra observaciones verificadas.
- Captura inspeccionada en viewport de aproximadamente 914 px: adaptación a una columna, texto legible y controles visibles; no es prueba exhaustiva de breakpoints ni Wails.
- Controles nativos, etiquetas, foco al título tras cambiar de paso y anuncio de selección. No se afirma auditoría completa de accesibilidad.
- Revisión personal de seguridad y simplicidad: escape de valores introducidos, sin scripts externos, sin peticiones de red ni persistencia. Sin subagentes.
- No suites Go/React/build: artefacto documental independiente, ningún código productivo tocado.

Archivos: index.html/README creados; handoff, maestro y roadmap/digest actualizados. Sin push, PR, CI remota, merge, release o promoción. #1063 en el Project Vantare. Pendiente criterio visual de Isaac.
