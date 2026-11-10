# Paridad: grupos y barra de General

Base: nightly `d74c07710` (marco). Especificación: auditoría aprobada
`D:/VantareServer/evidence/hub-web/pantallas/00-paridad-visual.md`, §1.4 y §2.

| General, 1440×900                 | Tras el marco | Este cambio |
| --------------------------------- | ------------: | ----------: |
| Oscuro, píxeles RGBA distintos    |     66,2716 % |   47,1215 % |
| Claro, píxeles RGBA distintos     |     66,6198 % |   51,6583 % |
| Oscuro, pixelmatch complementario |      6,5442 % |    5,1122 % |
| Claro, pixelmatch complementario  |     12,8546 % |    4,4628 % |

No hay máscaras, alineado ni exclusión del antialias. Pares originales y nuevas
capturas, diferencias y fuentes físicas en
`D:/VantareServer/evidence/hub-web/visual-componentes-caps/{dark,light}/ajustes-aplicacion/`.
La comparación anterior está en `visual-frame-final/`. La paridad global sigue
abierta: controles propios de ventana, detalle del raíl de navegación y las
otras pestañas se completan en los siguientes cambios de la auditoría.

Componentes compartidos para las otras pantallas:

- `ui/Data.tsx`: `SettingGroup({number:number,title:string,children:ReactNode})`.
  Rótulo numerado fuera de la tarjeta, filas sin relleno adicional de tarjeta.
- `ui/Frame.tsx`: `RailBlock({title:string,icon:IconName,children:ReactNode})`,
  `RailVersion({children})`, `RailShortcut({label:string,children})`.
  Se pasan como contenido de `SectionChrome.rail`; mantienen el contexto de pantalla.
- `ui/TrackedCaps.tsx`: rótulos por glifo como `orbit/neo.rs::tracked_family`,
  con redondeo a píxel y un nombre accesible completo.

Se recuperan el interruptor 36×22, botones secundarios transparentes, primario
carmín, stepper 156×44, segmentado, teclas y avatar de 30. Los cuatro bloques
de General usan datos y acciones del puente: versión, preparar/copiar informe
y navegación a Actualizaciones. Diagnóstico comparte el mismo hook y caché,
sin duplicar peticiones ni permitir copiar antes de preparar un informe.

Corrección de tokens desde el Rust congelado (sin modificarlo):
`orbit/neo.rs:26` dibuja `neo` a 180°, y `orbit.rs::carmine_face` dibuja el botón
a 180°. El JSON exportado tenía 155°/135°. Se corrige el JSON y se regenera el
CSS para las 18 combinaciones. Sombras y blanco del interruptor proceden de
`orbit/skin.rs` y del kit; no hay colores literales en los componentes.

Validación: 224 tests en 17 ficheros, incluidos preparar/copiar desde General
(sin toast que tape el contenido) y nombres accesibles con tildes. TypeScript,
Biome, lint de diseño, build Electron QA y recorrido de Ajustes en Chromium
con axe sin infracciones. La ejecución inicial paralela de Vitest sufrió plazos
al arrancar workers; la suite completa secuencial pasó sin ampliar plazos ni
cambiar configuración.
