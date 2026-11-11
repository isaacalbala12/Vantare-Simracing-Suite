# Banco GPUI compartido (QA)

El inventario fijo es `D:/VantareServer/qa/referencia-gpui-bin/bank.json`; apunta al
ejecutable compilado `versions/1d8614ed4/vantare.exe` dentro de ese banco.
`bank.json` fija SHA256, commit de origen y perfil Release. El script comprueba
ese hash antes de abrirlo. Sus replies son locales; no usa cuentas ni servicios reales.
El banco incluye los recursos públicos y una plantilla QA propia.

Desde `vantare-v2/`, sin compilar Rust:

```powershell
$env:VANTARE_HUB_QA_ROOT = 'D:/VantareServer/qa/<worker>'
pwsh -NoProfile -File hub-web/scripts/capture-gpui-bank.ps1 -Scene ajustes-aplicacion -Theme dark -Output 'D:/VantareServer/evidence/hub-web/<worker>/ajustes-aplicacion.png'
```

`-Theme light` usa el mismo tamaño físico 1440×900, paleta Vantare y zoom 100.
Cada ejecución copia la plantilla a un directorio aleatorio y conserva esa ruta
en `<PNG>.bank.json`. La ventana nace fuera de todos los monitores, sin foco;
se captura exclusivamente su HWND con PrintWindow. Las esperas tienen plazo.
Se cierra por EOF de stdin y se mata únicamente su árbol si no responde en 10 s.
El banco serializa internamente sus capturas con su mutex; ningún worker debe
adquirir ese mutex por fuera ni recompilar el Hub para una escena ya existente.

La plantilla y el ejecutable son inmutables para B, C y D. Si falta una escena,
pedir su incorporación al responsable del banco. No sustituir referencias
existentes sin revisar los datos y el permiso de acceso de la nueva captura.

Validado en las siete escenas siguientes, en oscuro y claro, 1440×900 y sin foco.
SHA del banco anterior usado para esas 14 referencias: `8e42ad931cacd7e7c67a813365674a0f8735c7bf2d453b8c77c0882b506ed4bd`.
Las 14 imágenes y recibos están en `D:/VantareServer/evidence/hub-web/referencia-gpui/`;
el informe con hashes y entradas, en `D:/VantareServer/evidence/hub-web/bank-followup/reference-report.json`.
Las versiones anteriores se conservan como evidencia; no se distribuye este binario.

Escenas adicionales del banco QA (sin ampliar el catálogo del Hub productivo):
`strategy-proximamente` muestra la página real «Próximamente», sin forzar el viejo
planificador; `notificaciones-completa` muestra la sección completa, sin popup.
Las cinco escenas `testing-center-{resumen,cuestionarios,comunidad,triage,diagnostico}`
añaden automáticamente `--qa-testing`, el hook existente `VANTARE_CAPTURE_POLICY=ipc`
y replies locales de tester, con el cuestionario
y la contribución públicos de QA. No usan una cuenta real. La selección de pestaña
conserva el directorio propio con PID que verifica el banco. Antes de capturar se
esperan las lecturas de política y cuenta en los logs QA, con plazo de 15 s; no se
confunde el subrayado de una pestaña con la admisión real del tester.

Cada `.capture.json` conserva el hash de las entradas y el recibo nativo del PNG
(SHA-256 de la concatenación hexadecimal de los SHA-256 de bloques de 1 MiB),
calculado con la misma función que la herramienta de diferencias. El SHA-256 simple
del fichero queda en `png_sha256` de `.bank.json`. Para reparar un recibo antiguo
sin recapturar, calcula `node --experimental-strip-types scripts/reference-receipt.ts <png>`
y sustituye únicamente `png` en su `.capture.json`, tras verificar el SHA simple
contra `.bank.json`. Cada `.bank.json` conserva escena, tema, paleta, zoom, DPI, tamaño, SHA del binario,
commit, SHA de replies y PNG y la raíz QA. Para repetir exactamente los datos se
conserva esa raíz; los replies originales de la plantilla compartida no se modifican.
El alias de Notificaciones conserva el reloj de su escena QA de panel, pero abre
la sección completa. Cada captura acaba su proceso antes de comenzar otra.

## Puertas reales de privacidad y acceso

El banco actual, fuente `1d8614ed4`, SHA-256
`d88d5e5a55c24ca1705e953012774dc29e4f49a475f3e03216dba455f77a2564`,
añade el flag autorizado `--qa-measure` al ejemplo QA. Este modo conserva las
puertas reales y rechaza `--demo` y `--qa-testing`; exige que tanto
`VANTARE_NATIVE_DATA_ROOT` como `LOCALAPPDATA` sean la raíz QA explícita.
No cambia el Hub distribuido. Toma el mismo mutex de captura antes de abrir GPUI.

El script selecciona ese modo para `privacidad-pendiente`, `privacidad-uso` y
`acceso-base`. Crea decisiones locales con todos los permisos denegados, espera
la respuesta local de cuenta y prepara únicamente el HWND del ejecutable QA
verificado fuera de los monitores, a 1440×900 y sin activarlo. El helper existente
comprueba DPI 96 y ausencia de foco antes de PrintWindow; `.window.json` conserva
el resultado de la preparación. No se maneja el escritorio ni se abre el navegador.
La opción nueva `-Offscreen` de `scripts/visual-diff/capture.ps1` solo sirve con
`-Prepare`; las llamadas existentes conservan su comportamiento.

Las seis referencias dark/light están en `referencia-gpui/{dark,light}` con sus
recibos. Informe: `D:/VantareServer/evidence/hub-web/acceso-referencias/reference-report.json`.
Dos tests del ejemplo y build Release pasan en Windows; cada captura cerró su PID
antes de la siguiente. El Clippy del crate GPUI congelado conserva sus errores
previos (17 hallazgos en código fuera del ejemplo); no se modifica ni se silencia.
