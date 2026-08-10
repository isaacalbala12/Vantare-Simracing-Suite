# Overlay Studio V1 — estabilización en Testers y lanzamiento comercial controlado

- Estado: decisión aprobada; ejecución pendiente
- Issue: ISA-315 / OS-10
- Responsable de producto y aprobaciones: Isaac
- Fecha de decisión: 2026-08-10
- Hito de calidad: Overlay Studio V1 estable en `testers` antes del 2026-08-31
- Ventana comercial objetivo: 2026-09-22 a 2026-09-30
- Base de planificación: `nightly@7e39104`

## 1. Decisión

Vantare separa tres hitos que no deben confundirse:

1. **Overlay Studio V1 estable en Testers.** Es el objetivo de agosto. Demuestra
   calidad del editor y sus superficies, pero no implica `master`, release
   pública ni que toda la suite esté terminada.
2. **Inicio de venta controlada.** Es el objetivo de la segunda mitad de
   septiembre. Se realiza por invitación y cohortes pequeñas alrededor de
   Overlay Studio V1. No es una beta pública abierta.
3. **Lanzamiento Stable completo de Vantare.** Exige la migración a raíz y los
   gates globales de producto, plataforma y comercio. No forma parte del hito
   de agosto ni se promete para septiembre.

Overlay Studio V1 es la propuesta principal de la primera venta. Engineer,
Strategy y Analysis pueden estar presentes como módulos **Beta** o **Preview**
si su estado se comunica de forma visible, segura y honesta. No se presenta la
suite completa como terminada. Engineer sigue siendo parte de la edición
inicial y debe continuar hacia la mayor completitud razonable antes del Stable
completo.

Se difieren sin bloquear estos hitos:

- importación comunitaria de telemetría;
- comunidad de Strategy;
- ampliaciones internas del Workshop sin impacto en el producto;
- nuevos widgets, sistemas visuales o simuladores fuera del alcance V1.

## 2. Promesa de Overlay Studio V1

La versión que puede declararse estable en Testers permite:

- crear, editar, guardar, duplicar, cargar y recuperar perfiles;
- editar layout, contenido, comportamiento y apariencia desde un único editor;
- usar los cuatro widgets insignia: Standings, Relative, Delta y Pedals;
- seleccionar Vantare Original, Crystal y Endurance/Redline según catálogo y
  licencia;
- conservar el mismo renderizado mediante `WidgetVisualHost` en Studio,
  Desktop y OBS;
- consumir telemetría real de Le Mans Ultimate sin presentar fixtures como
  datos live;
- trabajar con LMU desconectado, conectarlo durante la sesión y recuperarse de
  una desconexión;
- usar ventanas transparentes, click-through y modo edición sin perder el
  perfil;
- adaptarse a Windows 10/11, resoluciones habituales, ultrawide y escalado DPI;
- instalarse, actualizarse y volver a una build conocida sin pérdida de datos.

El Workshop es una herramienta interna de autoría. Debe seguir físicamente
excluido de las builds Stable y no forma parte de la promesa comercial.

## 3. Definición de estabilidad en Testers

Overlay Studio V1 se declara estable únicamente sobre un SHA exacto de
`testers` que cumpla todos estos criterios:

### 3.1 Calidad funcional

- cero defectos P0 o P1 abiertos;
- cero P2 reproducible en los flujos principales;
- P3 restantes documentados, con impacto y workaround comprensibles;
- los cuatro widgets insignia funcionan con datos fixture y LMU real;
- guardar, cerrar, reiniciar y recargar conserva documento y layout;
- un conflicto de guardado o perfil inválido falla de forma segura y visible;
- Studio, Desktop y OBS representan el mismo documento y ViewModel;
- las restricciones Free/Pro/Pro Plus/Launch fallan cerradas;
- idioma, teclado y navegación básica no bloquean la tarea principal.

### 3.2 Calidad técnica

- `go test ./...` pasa sin depender de reintentos;
- suite frontend completa y build pasan;
- lint focal de los archivos afectados pasa;
- `design-system:check` pasa;
- gate visual de Overlay Studio pasa sobre el SHA exacto sin regenerar
  baselines para esconder diferencias;
- smoke de Studio, Desktop y OBS pasa en una build de aplicación real;
- el build productivo no contiene rutas, chunks ni sentinels del Workshop;
- el candidato permanece 48 horas sin regresión material ni cambio funcional.

Las deudas advisory heredadas solo pueden aceptarse si están ligadas a una
issue, se reproducen en la base y no invalidan el comportamiento que protegen.
No se acepta reejecutar CI hasta obtener verde como sustituto de corregir un
test flaky.

### 3.3 Severidad operativa

| Nivel | Definición | Decisión |
|---|---|---|
| P0 | pérdida o corrupción de datos, problema de seguridad, compra/acceso incorrecto o aplicación inutilizable | detiene el tren inmediatamente |
| P1 | flujo principal de Studio/Desktop/OBS roto, overlay incorrecto en carrera o crash repetible | bloquea cualquier candidato |
| P2 | degradación importante con workaround difícil o incompatibilidad relevante de equipo | debe cerrarse antes de declarar estable |
| P3 | defecto cosmético o fricción menor con workaround claro | Isaac puede aceptarlo y documentarlo |

## 4. Alcance congelado de agosto

Hasta el primer candidato Testers solo entra trabajo necesario para:

- completar, revisar e integrar Pedals Redline;
- estabilizar los gates que protegen la entrega;
- corregir defectos reproducibles de Overlay Studio;
- completar evidencia visual, responsive, LMU, Desktop y OBS;
- preparar la promoción canónica `nightly -> testers`.

Quedan fuera del camino crítico:

- migración de Vantare V2 a la raíz;
- firma y publicación Stable de toda la suite;
- renombrado general del CSS `isa93-*`;
- purga de templates de exploración, salvo problema demostrable para usuarios;
- investigación OS-05 sobre layouts separados de Desktop y OBS;
- nuevas animaciones que exijan ampliar contratos de telemetría;
- nuevas features de otros módulos.

Un hallazgo fuera de este alcance crea su propia issue y no se incorpora
silenciosamente al candidato.

## 5. Calendario de estabilización

| Fecha límite | Resultado requerido | Si no se cumple |
|---|---|---|
| 2026-08-14 | Pedals Redline revisado; ISA-311 resuelto o aislado de forma determinista; alcance congelado | reducir alcance no esencial y replanificar RC0 |
| 2026-08-19 | RC0 en Nightly con gates técnicos y visuales completos | el 31 de agosto pasa a estar en riesgo |
| 2026-08-22 | feedback interno de RC0 cerrado y SHA candidato identificado | no promover con feedback material abierto |
| 2026-08-23 | candidato promovido canónicamente a Testers | si llega después del día 25, mover la declaración estable |
| 2026-08-27 | primera matriz de diez testers completa; P0/P1/P2 triados | abrir issues/fixes y emitir RC1 |
| 2026-08-29 | candidato final sin defectos materiales y con gates repetidos | NO-GO para el 31 |
| 2026-08-31 | 48 horas de quiet period y declaración Stable en Testers | mover el hito; nunca cambiar la definición de estable |

La promoción requiere su propia issue y aprobación. Este plan no autoriza
merge, promoción, tag, release ni comunicación pública.

## 6. Matriz de diez testers

Todos los testers ejecutan el smoke común. Cada uno recibe además una misión
principal para evitar que diez personas repitan únicamente el camino feliz.

| Tester | Cobertura primaria | Escenario profundo |
|---|---|---|
| T1 | Windows 10, 16:9, 100 % DPI | instalación limpia y primer perfil |
| T2 | Windows 11, 16:9, 125/150 % DPI | navegación, teclado e inspector |
| T3 | Windows 10, 21:9 | drag/resize, límites y zoom |
| T4 | Windows 11, 21:9 | responsive y cambio de resolución |
| T5 | Windows 10, 32:9 | canvas ultrawide y multimonitor |
| T6 | Windows 11, 32:9 | Desktop transparente y click-through |
| T7 | Windows 11 + OBS | browser source, transparencia y reconexión |
| T8 | Windows 10/11 multimonitor | mover ventanas, DPI mixto y recuperación |
| T9 | actualización | instalar versión anterior, actualizar y conservar perfiles |
| T10 | sesión larga LMU | 90–120 minutos, desconexión/reconexión y estabilidad |

Cobertura mínima transversal:

- cada widget debe ser probado por al menos tres personas;
- Studio, Desktop y OBS deben tener al menos dos responsables cada uno;
- Windows 10 y Windows 11 deben cubrir todos los flujos críticos;
- al menos dos equipos deben cubrir 1920×1080 o 2560×1440, aunque sea
  configurando temporalmente la pantalla;
- escalado 100 %, 125 % y 150 % debe aparecer en la matriz final;
- los diez reportes deben señalar build/tag y SHA exactos.

La cohorte reportada cubre Windows 10/11 y formatos 21:9 a 32:9, con respuesta
el mismo día. La resolución comunicada `3840×1920` tiene relación 2:1 y no
equivale a 21:9 ni 32:9; debe confirmarse antes de asignar la matriz definitiva.

### 6.1 Smoke común

Cada tester realiza, en orden:

1. instalar o actualizar la build indicada;
2. abrir Studio sin LMU y crear o duplicar un perfil;
3. añadir y configurar Standings, Relative, Delta y Pedals;
4. mover, redimensionar, ocultar, ordenar y guardar widgets;
5. reiniciar Vantare y verificar que el perfil se conserva;
6. conectar LMU y comprobar datos reales;
7. abrir Desktop, probar modo carrera/edición y click-through;
8. abrir OBS y comparar el mismo perfil;
9. desconectar y reconectar LMU;
10. adjuntar resultado y evidencia de cualquier fallo.

Cada reporte registra: build/tag, SHA, Windows, GPU, resolución, DPI, número de
monitores, versión de OBS, escenario, resultado, pasos de reproducción y
evidencia. No debe incluir secretos, rutas privadas ni archivos de telemetría.

### 6.2 Ciclo de feedback

```text
reporte del tester
  -> triage el mismo día
  -> issue hija por hallazgo material
  -> fix y test de regresión en rama aislada
  -> review y CI
  -> nueva Nightly/Testers autorizada
  -> repetición por quien informó y por un segundo tester
```

Un fallo no se cierra porque no aparezca en otro equipo. Se cierra con causa,
fix, evidencia o una decisión explícita de no reproducible/aceptado.

## 7. Gate comercial de septiembre

Estable en Testers no autoriza todavía ventas. La plataforma comercial se
mantiene **NO-GO** hasta demostrar estos grupos:

### 7.1 Repositorio y artefactos

- ISA-78 a ISA-85 de la migración a raíz cerradas en orden;
- rollback y archive verificados antes de cualquier limpieza;
- checkout limpio desde la nueva raíz;
- tests, build, packaging, installer, updater y smoke repetidos después de la
  migración;
- la limpieza irreversible ISA-86 conserva aprobación separada de Isaac.

### 7.2 Compra, cuenta y acceso

- Polar y Supabase reconciliados según el contrato canónico;
- compra sandbox completa: checkout, webhook, entitlement, login, activación,
  portal, cancelación, expiración y refund de prueba;
- planes, precios y beneficios coinciden en checkout, app y documentación;
- acceso de canal firmado y fail-closed;
- recuperación y rollback demostrados sin tocar datos reales;
- cualquier prueba con dinero real requiere autorización explícita de Isaac.

### 7.3 Distribución y confianza

- artefactos reproducibles, checksums y manifiesto verificables;
- actualización desde la versión anterior y rollback sin pérdida de perfil;
- soporte, términos, privacidad y política de reembolso revisados;
- mensaje comercial distingue Overlay Studio V1 estable de módulos
  Beta/Preview;
- no se habilita telemetría de producto por defecto.

La documentación vigente no es uniforme sobre si una primera distribución
puede salir sin firma Authenticode. El lanzamiento de pago debe resolver esa
decisión por escrito. La opción recomendada es firma antes de cobrar; si no
está disponible, Isaac debe emitir un GO explícito con aviso SmartScreen,
checksums, riesgo y soporte documentados.

## 8. Calendario comercial

| Ventana | Objetivo |
|---|---|
| 2026-09-01 a 2026-09-12 | migración a raíz, CI/rutas, checkout limpio, build y smoke postmigración |
| 2026-09-13 a 2026-09-20 | Billing/licencias end-to-end, firma o decisión explícita, installer/updater, soporte y mensaje |
| 2026-09-21 | revisión GO/NO-GO del candidato comercial |
| 2026-09-22 a 2026-09-24 | cohorte inicial por invitación: hasta 25 clientes |
| 2026-09-25 a 2026-09-27 | observación, soporte y correcciones; sin expansión automática |
| 2026-09-28 a 2026-09-30 | ampliar a 50–100 clientes solo si los gates continúan verdes |

Es un lanzamiento comercial directo y cerrado por cohortes, no una beta
pública abierta. La apertura general posterior requiere otra decisión y no se
deduce de vender correctamente a la primera cohorte.

## 9. GO/NO-GO y expansión

### GO para la primera cohorte

- Overlay Studio mantiene el SHA declarado estable o una corrección posterior
  con la misma matriz repetida;
- cero P0/P1 abiertos y cero P2 en flujos principales;
- compra, entitlement e instalación end-to-end pasan;
- soporte puede responder el mismo día durante la apertura;
- rollback de build y pausa comercial están preparados;
- Isaac aprueba explícitamente el inicio de venta.

### GO para ampliar

- al menos cinco días de observación sin P0/P1;
- todas las compras quedan reconciliadas con su acceso correcto;
- al menos 95 % de instalaciones/activaciones terminan sin intervención
  manual; cada fallo restante tiene causa y respuesta;
- no existe tendencia de pérdida de perfiles, fallos de actualización o
  incompatibilidad general de hardware;
- la carga de soporte sigue siendo sostenible.

### NO-GO o pausa inmediata

- acceso concedido o revocado incorrectamente;
- cobro sin entitlement reconciliado;
- pérdida/corrupción de perfiles;
- installer, updater o rollback no reproducibles;
- regresión material de Studio, Desktop, OBS o Telemetry Core;
- contradicción no resuelta sobre precio, plan, firma o mensaje comercial;
- incapacidad de responder a los clientes dentro del compromiso anunciado.

## 10. Rollback

Ante un NO-GO después de iniciar ventas:

1. pausar nuevas invitaciones y expansión;
2. conservar el SHA, artefactos y evidencia fallidos;
3. mantener el acceso de clientes existentes salvo riesgo de seguridad o datos;
4. fijar o restaurar la última build conocida mediante el flujo normal;
5. corregir en rama de issue y promover de nuevo por todos los canales;
6. comunicar el impacto de forma directa a la cohorte afectada;
7. tratar refunds o compensaciones caso a caso con aprobación de Isaac;
8. reanudar únicamente después de repetir el gate que falló.

No se reescribe historial, no se reutilizan tags y no se ocultan fallos mediante
baselines, reintentos indefinidos o downgrade silencioso de criterios.

## 11. Autoridad y responsabilidades

- **Isaac:** alcance, aceptación de P3, promociones, GO/NO-GO comercial,
  comunicación pública, pagos/refunds y cualquier limpieza irreversible.
- **Orquestación técnica:** issues, ramas, reviews, gates, matriz, evidencia,
  handoffs y trazabilidad de SHAs.
- **Testers:** ejecutar el escenario asignado sobre el candidato exacto,
  responder el mismo día y repetir las correcciones.
- **Responsable de Billing/plataforma:** demostrar compra, acceso, rollback y
  recuperación; no habilitar producción por inferencia.

## 12. Criterio de cierre de ISA-315

ISA-315 termina cuando este plan está revisado y enlazado desde la documentación
viva, no cuando los hitos futuros se hayan ejecutado. Cada implementación,
promoción, migración, prueba monetaria o release conserva su propia issue,
aprobación y evidencia.
