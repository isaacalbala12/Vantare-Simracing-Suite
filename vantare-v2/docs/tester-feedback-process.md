# Protocolo de Feedback y Reporte de Bugs - Beta Publica v0.1.0.0

Gracias por ayudarnos a probar **Vantare Suite**. Para mantener el desarrollo ordenado y priorizar los problemas mas rapido, hemos establecido este protocolo a traves de nuestro servidor de Discord.

---

## 1. Canales de Discord

Para las pruebas de la Beta Publica usamos los siguientes canales:

- `#beta-announcements`: comunicados oficiales, publicacion de nuevas builds, notas de version.
- `#beta-downloads`: enlaces de descarga del instalador, binarios portables y checksums SHA256.
- `#beta-known-issues`: lista viva de problemas conocidos bajo investigacion (sincronizada con `docs/tester-known-issues.md`).
- `#beta-bug-reports`: canal exclusivo para reportar fallos usando la plantilla obligatoria.
- `#beta-feedback`: canal libre para sugerencias, ideas de diseno y debates generales.

> [!NOTE]
> Las invitaciones al servidor y enlaces a canales se publican unicamente en `#beta-announcements` y en la pagina oficial del proyecto. No publiques enlaces de invitacion en capturas publicas.

---

## 2. Que SI y que NO reportar

### SI debes reportar (en `#beta-bug-reports`)

- **Crashes**: la aplicacion se cierra sola al abrirla o durante el uso normal.
- **Fallos de persistencia**: haces cambios en WidgetStudio o LayoutStudio, pulsas **Guardar**, pero al cerrar y reabrir la app los cambios no estan.
- **Discrepancias visuales**: el widget se ve de una forma en la preview de WidgetStudio pero cambia de tamano, posicion o diseno al abrir el overlay real o cargarlo en OBS.
- **Problemas de recorte (clipping)**: textos cortados, tablas incompletas, espacio vacio gigante a los lados de los widgets.
- **Errores en OBS**: la URL local `/overlay?profile=...` no renderiza los widgets o no conecta con el flujo de datos.
- **Problemas de login o licencia**: el flujo OAuth falla, no se puede elegir plan, la gracia offline no funciona como se describe.
- **Errores de actualizador**: el boton de actualizar no responde, la descarga falla, el instalador no se lanza.
- **Problemas con perfiles**: errores al duplicar recomendados, al guardar copias propias, al activar un perfil.

### NO debes reportar (fuera de alcance)

- Advertencia de SmartScreen al ejecutar la app (ver Known Issues).
- Ausencia de audio o voces del spotter en Ingeniero.
- Falta de datos en tiempo real del Ingeniero conduciendo en LMU (se simula via replay).
- Falta de telemetria precisa en Pedals.
- Soporte para simuladores distintos de Le Mans Ultimate.
- Reworks visuales completos (el diseno actual esta fijado para esta fase salvo cambios pequenos).
- Widget Track Map o Input Telemetry/Trace no disponibles (son experimentales).
- **Galeria de disenos de widgets**: incluida como catalogo de disenos oficiales de solo lectura (no marketplace, sin compartir). Si encuentras problemas con la aplicacion de un diseno oficial sobre un widget soportado, reportalo en `#beta-bug-reports`.

---

## 3. Plantilla obligatoria de reporte de bugs

Cuando encuentres un fallo, copia y rellena esta plantilla en **`#beta-bug-reports`**:

```text
**[Bug] Nombre corto descriptivo del problema**

- **Version de la App**: v0.1.0.0 (o la que corresponda)
- **Version de Windows**: Windows 10 / Windows 11 (64 bits)
- **Plan**: free / paid / suite
- **Simulador Abierto**: Si / No
- **Origen de datos**: Live (LMU abierto) / Mock (sintetico)
- **Modo de visualizacion**: Overlay de escritorio / OBS local

**Pasos para reproducir:**
1. [Ejemplo: Iniciar sesion con Google y elegir plan paid]
2. [Ejemplo: Abrir Overlays Studio -> Widgets -> Relative]
3. [Ejemplo: Desactivar la columna de vuelta rapida y pulsar Guardar]

**Resultado esperado:**
[Ejemplo: El widget debe guardarse sin la columna y ajustar su ancho automaticamente]

**Resultado actual:**
[Ejemplo: La columna desaparece pero queda un espacio vacio a la derecha]

**Capturas/Videos:**
[Adjunta aqui tu captura o video del fallo]

**JSON de Perfil (opcional pero recomendado):**
[Si el fallo es con un perfil, adjunta el archivo JSON correspondiente de la carpeta configs/]

**Checksum del instalador/portable (opcional):**
[Si el fallo es de instalacion, descarga o actualizacion, incluye el SHA256 de tu descarga para verificar integridad]
```

---

## 4. Como enviar feedback general

Para sugerencias, ideas o debates usa **`#beta-feedback`** en formato libre. No es necesaria la plantilla anterior. Si una sugerencia se convierte en accion concreta, el equipo la movendra a su canal interno y la marcara como `ACCEPTED`.

---

## 5. Tiempos de respuesta

- **Crashes y bloqueantes**: acknowledged en menos de 24 horas laborables.
- **Fallos importantes y menores**: acknowledged en 2-5 dias laborables.
- **Sugerencias**: acknowledged cuando se priorizan.

Este protocolo es de buenas practicas; no garantiza plazos firmes. El equipo de Vantare es pequeno y agradece tu paciencia.