# Miniaturas de overlays — receta aplazada

VANTA-138, #1995, diseño 10b §h. **No ejecutar la captura todavía**: el orquestador
la aplazó por la sospecha de hardware. Se autorizará con Isaac presente o después
de comprobar la memoria. Este cambio no genera PNG ni abre ventanas.

El componente carga un PNG por tipo si existe y vuelve al SVG al faltar o fallar
la imagen. `manifest.json` contiene los 19 tipos, tamaño natural y `scale: 1`,
hash de defaults y foto/secuencia real elegida. Los PNG son comunes a ambos temas
del Hub; la galería aporta el fondo del lienzo y la sombra en claro.

## Requisitos previos

1. El ejecutable debe compilarse o verificarse contra **origin/nightly**. No sirve
   un exe de `targets/isa-2022-ref` de procedencia desconocida. La verificación o
   compilación debe aportar un recibo con `sourceCommit`, `nativeTree`, `uiTree`,
   `assetsTree`, `binarySha256`, `features` (incluye `parity-capture`), `method` (`compiled` o `verified`) y una referencia
   `evidence` al log real. Los árboles son los hashes Git de `vantare-v2/native`,
   `native/ui` y `native/assets`. No rellenar un recibo para dar por bueno un exe
   desconocido. No se compila para obtener ×2: el capturador actual exige DPI 96,
   rechaza zoom y usa ×1.
2. Todos los worktrees deben estar limpios, con sus commits empujados. La receta
   lo comprueba antes y después de tomar `D:/VantareServer/qa/captura.lock`. No se
   captura junto a Rust ni a otro workshop. Un único proceso `--capture-batch`
   dibuja cada tipo consecutivamente; el cerrojo se retira al terminar o fallar.
3. Completar las entradas `ready: false` antes de autorizar la fase gráfica. El
   corpus real documentado en `native/ui/fixtures/telemetry-real/README.md` no
   acredita un aviso activo de sesión ni historiales llenos: las doce fotos de
   inputs cubren 240 ms y la foto ACC con delta no es una secuencia. La receta
   conserva esas limitaciones y aborta antes de abrir ventanas. No se repiten
   fotos ni se inventan valores para rellenar una traza.

La foto LMU47 es la base. ACC aporta la bandera verde y el delta real que faltan
allí; la excepción queda registrada por tipo. Se preservan tiempos, calidad,
secuencias, ids y números. Solo se sustituyen nombres por «Tú» y «Piloto de
ejemplo N», con asignación estable en la secuencia. No se usan cuentas reales.

## Cuando se autorice

Desde la raíz Git, Windows a escala 100 %, después de actualizar las fotos
pendientes y el recibo:

```powershell
pwsh -NoProfile -File tools/hub-web/thumbs.ps1 -Capture `
  -Workshop D:/ruta-verificada/vantare-workshop.exe `
  -Provenance D:/VantareServer/evidence/hub-web/isa-1995-c-studio-miniaturas/provenance.json `
  -QaRoot D:/VantareServer/qa/isa-1995-c-studio-miniaturas
```

Sin `-Capture`, el script solo muestra el plan. Durante la preparación se ha
validado la sintaxis y los datos mediante tests; **no se ha ejecutado la receta**.
El batch usa los Settings de `widget-defaults.json`, recorte y alfa negro/blanco
que ya ofrece GPUI. Solo se publican las imágenes después de validar todas:
RGBA de 8 bits y tamaño natural exacto. El manifiesto recibe commit, SHA del exe,
fecha y hash de las fotos anonimizadas. Los PNG no se reescalan para simular ×2.

Si una captura no coincide con el tamaño natural, se conserva la reserva SVG y
se investiga la diferencia; no se recorta ni deforma silenciosamente. Un fallo
nativo 0x8013xxxx/0xC000xxxx se registra en `muertes.md` y se reintenta una vez;
dos consecutivos requieren avisar al orquestador.

Al ejecutar la fase 2 habrá que revisar pesos (objetivo ≤250 KB/imagen y 2,5 MB
total), generar la hoja de contacto dark/light y adjuntarla al PR. Esos pasos
están aplazados junto con las imágenes; no se instalan optimizadores nuevos.
