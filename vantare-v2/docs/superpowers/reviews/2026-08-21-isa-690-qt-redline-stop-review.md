# Review T22 — runtime Redline Qt Quick

Fecha: 2026-08-21. Issue: GitHub #690. Rama revisada:
`vantareapp/isa-693-qt-standings-gate`. Base del gate:
`e5e61d485cd0a493ba2998f0238c7bd9acb3c05d`.

## Veredicto

- SPEC: PASS para decisión **STOP**.
- QUALITY: PASS después de corregir los dos P2 y el P3 documentales.
- Severidades finales: P0=0, P1=0, P2=0, P3=0.

Qt Quick conserva viabilidad visual, pero Standings no alcanza el hard gate
temporal sin introducir una arquitectura expresamente fuera de alcance. Wails
continúa como único runtime Redline productivo. No se crean selector,
supervisor, sidecar productivo, packaging ni issues P2+.

## Evidencia independiente

- T18: 50/50 trazas presentes y hashes/tamaños exactos contra manifests.
- T20: 10/10 trazas presentes y hashes/tamaños exactos contra manifest.
- T18 stress p50/p95/max: 8,8172/268,0703/1001,9299 ms.
- T20 stress p50/p95/max: 9,2699/330,7235/1203,6608 ms.
- El mejor margen posible sigue materialmente fuera de 8/16,67 ms; T21 puede
  omitirse por fail-fast porque la comparación visual no puede convertir ese
  fallo interno en GO.
- Agregador sintético PASS preservando el resultado FAIL; motion-trace Qt
  6.10.2 exit 0; `git diff --check` PASS.
- Cero diferencia neta en QML Standings, modelos keyed y tests Standings tras
  los reverts.
- Cero integración productiva: sin cambios en Wails, Telemetry Core, Studio,
  Workshop, OBS, selector, supervisor o canales de release.

## Correcciones del review

1. El roadmap deja de anunciar una evaluación activa y publica que Wails
   continúa tras el STOP de Qt.
2. Las issues cerradas dejan de conservar `state:in-progress`.
3. El dossier T18 identifica las rutas locales exactas de sus raw.

## Límites

No se ejecutó T21, una nueva ventana/HWND, otro benchmark físico, integración,
promoción ni release. El push de archivo activó un fallo de arranque sin jobs
del workflow inerte de Testing Center, reproducido en ramas no relacionadas y
registrado fuera de alcance en GitHub #728. No fue un gate del candidate. La
decisión STOP termina el programa antes de P2.
