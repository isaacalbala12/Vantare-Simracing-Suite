# ISA-1322 — Revisión de la detección de Defender

Fecha: 2026-09-22. Solicitud de Isaac: verificar antes de considerar una autorización del archivo. Código inspeccionado: `b0d793a88ca62518ea3f6625ee78120c3815fc26`, rama `vantareapp/isa-1322-strategy-desk-fidelity`, base `8466c4a0`. Trabajo de solo lectura sobre aplicación, build y antivirus; únicamente se añade esta evidencia documental.

## Conclusión

**Falso positivo probable, no confirmado.** No se halló comportamiento malicioso en el fuente revisado ni diferencias en los 168 archivos oficiales comparados de seis paquetes instalados. No se ha podido inspeccionar el JavaScript exacto marcado porque está en cuarentena. Esto no certifica la ausencia de malware en el bundle ni identifica la secuencia que dispara la detección.

## Evidencia local

- Defender identifica `Trojan:Script/ObfusScript.A!ml`, ThreatID 2147842389. Eventos 1116 señalan la protección en tiempo real y lecturas durante generación por Node e incorporación al ejecutable por Go; no prueban ejecución maliciosa de ese JavaScript.
- Archivo actual: `frontend/dist/assets/RacesOrbitPage-BtqPDHOa.js`. No está disponible en dist. No se restauró ni se extrajo de cuarentena.
- El historial registra la misma familia el 15 de septiembre en el worktree ISA-1277, sobre `RacesOrbitPage-DEYyq84p.js`; es anterior a la corrección ISA-1322. No demuestra por sí mismo que el nombre sea o no la causa.
- Defender permanece activado, incluida la protección en tiempo real. Versión de inteligencia observada 1.459.333.0, motor 1.1.26080.3. Node tiene firma Authenticode válida de OpenJS Foundation.
- `RacesOrbitPage.tsx`, `races-orbit-model.ts` y su CSS son idénticos a la base 8466c4a0 y a la referencia local origin/nightly. No se consultó una nueva referencia remota para esta comparación.
- En la página y modelo revisados no se hallan eval/Function, carga de scripts remotos, descarga/ejecución ni canales de envío directo de datos. Las acciones usan eventos Wails de calendario; el modelo conserva rango/zoom en localStorage. React usa portales a espacios existentes y la shell importa la página de forma diferida.
- El pipeline usa Vite, React y Tailwind sin plugin de ofuscación explícito. Ni la configuración de build ni package.json/lockfile fueron modificados en ISA-1322. La instalación documentada usó frozen-lockfile.
- `pnpm store status`: salida 0, `Packages in the store are untouched`. Es integridad de la caché, no una auditoría de seguridad de todas sus dependencias.

## Paquetes instalados cotejados con el registro oficial

Se descargaron exclusivamente archivos públicos de paquetes para leerlos en memoria, sin extraerlos, instalarlos ni ejecutarlos. Se contrastó SRI de lockfile contra metadata oficial, hash del tarball contra SRI y bytes de cada archivo local contra el archivo del paquete. No se enviaron fuentes de Vantare a terceros.

| Paquete | Archivos comparados | Diferencias |
|---|---:|---:|
| vite 8.0.16 | 36 | 0 |
| @vitejs/plugin-react 6.0.2 | 8 | 0 |
| @tailwindcss/vite 4.3.0 | 5 | 0 |
| react 19.2.7 | 27 | 0 |
| react-dom 19.2.7 | 43 | 0 |
| @wailsio/runtime 3.0.0-alpha.79 | 49 | 0 |

También coincide el SRI de rolldown 1.0.3 con la metadata del registro; no se afirma cotejo byte a byte de ese paquete ni de todos los transitivos. [Resultado estructurado](installed-packages-audit.json).

## Límite y siguiente acción

El artefacto exacto no se analizó, ejecutó ni reconstruyó para esta auditoría. No se conoce su SHA-256 y no se inventa. No se actualizó/alteró Defender, no se creó excepción, no se renombró el archivo y no se ejecutó otra build. No hubo pruebas funcionales nuevas porque no cambió código. La build sigue bloqueada; el umbral visual >9 continúa pendiente.

La [ficha oficial de la detección](https://www.microsoft.com/en-us/wdsi/threats/malware-encyclopedia-description?Name=Trojan%3AScript%2FObfusScript.A%21ml) no publica detalles técnicos que permitan identificar aquí su disparador. Microsoft indica [enviar el archivo como desarrollador y esperar su determinación](https://learn.microsoft.com/en-us/defender-xdr/developer-faq#how-do-i-dispute-the-detection-of-my-program) para disputar una detección. No se ha realizado ese envío; requeriría autorizar compartir el archivo del producto.

Auditoría de fuente: GPT-6 Sol medium; eventos, herramientas, comparación de paquetes y revisión de evidencia: root. Sin cambios productivos, nuevas dependencias, push, PR, CI remota, merge, promoción ni release. Runtime data/ intacto y excluido.
