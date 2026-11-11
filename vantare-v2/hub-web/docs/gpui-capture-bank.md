# Banco GPUI compartido (QA)

El ejecutable compilado está en `D:/VantareServer/qa/referencia-gpui-bin/vantare.exe`.
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

Validado con `ajustes-aplicacion` oscuro: PNG real, 1440×900, ventana sin foco,
SHA del banco `9463f44a518139469ebfa68471dd7411c5c013e3d5231f81c56830a4530db116`.
Evidencia: `D:/VantareServer/evidence/hub-web/bank-reusable-test/`.

Escenas adicionales del banco QA (sin ampliar el catálogo del Hub productivo):
`strategy-proximamente` muestra la página real «Próximamente», sin forzar el viejo
planificador; `notificaciones-completa` muestra la sección completa, sin popup.
Las cinco escenas `testing-center-{resumen,cuestionarios,comunidad,triage,diagnostico}`
añaden automáticamente `--qa-testing` y replies locales de tester, con el cuestionario
y la contribución públicos de QA. No usan una cuenta real. La selección de pestaña
conserva el directorio propio con PID que verifica el banco.

Cada `.capture.json` conserva el hash de las entradas y del PNG para la herramienta
de diferencias. Cada `.bank.json` conserva escena, tema, paleta, zoom, DPI, tamaño, SHA del binario,
commit, SHA de replies y PNG y la raíz QA. Para repetir exactamente los datos se
conserva esa raíz; los replies originales de la plantilla compartida no se modifican.
El alias de Notificaciones conserva el reloj de su escena QA de panel, pero abre
la sección completa. Cada captura acaba su proceso antes de comenzar otra.
