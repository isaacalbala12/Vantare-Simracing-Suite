# Modelo de dominio

| Concepto | Significado y fuente |
|---|---|
| Perfil | Documento persistido que reúne configuración y composición del overlay; ver [pkg/config](../pkg/config/) |
| Widget | Instancia de un tipo funcional con configuración de contenido, comportamiento y apariencia |
| Layout | Geometría y composición del perfil. Se edita en el mismo Studio que las propiedades del widget |
| Overlay Studio | Editor único de perfiles; [StudioRoute](../frontend/src/hub/overlay-studio/StudioRoute.tsx) |
| Recomendado | Perfil propuesto por Vantare del que se crea una copia propia para editar |
| Sistema visual | Renderizadores y configuración de apariencia resueltos por [WidgetVisualHost](../frontend/src/overlay/core/WidgetVisualHost.tsx) |
| Workshop | Entorno de desarrollo que renderiza el TSX/CSS productivo; no es otro editor de perfiles ni una exportación |
| Telemetry Core | Núcleo que adquiere y normaliza observaciones de las fuentes; conserva calidad, presencia y procedencia |
| Proyección | Contrato de datos específico para un consumidor. Overlay V2 no es la versión del perfil ni de la aplicación |
| Analysis | Análisis post-sesión; consulta histórico autorizado, con sus propios contratos |
| Engineer/Spotter | Consumidor live que produce mensajes y audio conforme a sus capacidades y política |
| Strategy Planner | Documento y cálculo de estrategia; el [handoff](vantare-program/handoffs/strategy-planner.md) resuelve los contratos vigentes |
| Desconectado | Sin fuente live disponible. No significa mock, cero ni una vuelta real |

`WidgetStudio`, `LayoutStudio` y los productos Strategy A/B/C son nombres históricos. No usarlos para inventar pantallas o dominios nuevos. Consultar [arquitectura](architecture.md) y el [mapa de proyectos](vantare-program/project-map.md).
