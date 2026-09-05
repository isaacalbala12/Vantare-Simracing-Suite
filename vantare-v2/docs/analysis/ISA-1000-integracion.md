# ISA-1000 · Integración V2 y feedback tester

Autorización explícita de Isaac el 2026-09-06: integrar el trabajo terminado
en nightly y corregir desde V2; si falla, rollback de esta integración.

## Manifest del candidato

- Base nightly: `483f4e802cf821da9de5814776b69cd850c9a108`.
- Retirada V1 completa: `28bac67650837d2a56d2466bfcbf7adf41436af7`, con
  Redline y la cadena #969–977 incluidos. Auditoría documental: `7cd24786`.
- #994: `3632e55d`, timeout durante el cuerpo HTTP.
- #995: `210340b8`, frescura de Damage ligada a la fuente LMU.
- #993/#989–992: `2dbf358b`, feedback de tester.
- Los microcortes #997–999 no terminados y PR de otros proyectos quedan fuera.

## Resolución de conflictos

Se preserva V2 como única autoridad: los builders, readers, acumulador y tests
legacy eliminados no se restauran desde #993. Se mantienen los cambios V2,
formatGear y los tipos/helpers puros requeridos por los renderers. H2H conserva
la geometría segura 360:128 y no vuelve a registrar un builder V1.

Track Map conserva la caché de contorno de nightly, los colores/clases del
feedback y ambas pruebas de geometría, en archivos separados. Roadmap conserva
ambas líneas de trabajo y se regenera desde la base remota. Los handoffs
históricos se conservan; este checkpoint gobierna la integración actual.

Relative Redline usa el candidato reciente sin FLIP ni ghosts. No se aplica
el antiguo #277 encima: su intención está superada por esta implementación.

## Validación

Typecheck del conjunto PASS. Suites y build del candidato en curso.
Los PASS históricos de cada rama no se atribuyen al conjunto integrado.
La prueba física anterior con LMU correspondía a `2dbf358b`, no a este árbol.

## Rollback

Conservar el exe anterior y los perfiles originales. La copia de prueba está
aislada. El punto anterior de nightly es el SHA base del manifest. Si se
revierte tras el merge, usar un revert del commit de integración con primer
padre nightly; nunca reset/force push ni revertir cambios ajenos posteriores.
Recompilar el commit anterior con el procedimiento oficial y reutilizar solo
la copia compatible del perfil. No publicar release ni promover testers/master.
