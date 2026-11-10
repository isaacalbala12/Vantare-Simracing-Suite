# VANTA-137 / #1993 — compilación y corte del Hub

Base de trabajo: nightly `d84ca4aa91397e60031eee58d08235b4c329a6af`.
Sin cambios de producto, dependencias externas nuevas, merge ni publicación.

## Grafo previsto antes de mover código

Las flechas indican dependencias, nunca propiedad de la aplicación:

```text
hub-orbit → ui (pintores y tokens existentes)
hub-common → hub-orbit (Section, fixtures demo, escenas, contexto de captura)
hub-launcher → hub-common, hub-orbit
hub-navigation → hub-launcher, hub-common (política de navegación y noticias)
hub-services → hub-navigation, hub-common, hub-orbit
hub-strategy / hub-analysis / hub-engineer → hub-common, hub-orbit
hub-studio → hub-services, hub-navigation, hub-common, hub-orbit
hub-pilot → hub-common, hub-orbit
hub-shell → módulos anteriores (composición, Ajustes y captura de ventana)
hub → hub-shell (entrada del proceso y fachada compatible)
```

Cuenta, Calendario y Testing comparten entidades GPUI concretas: Remote contiene
editores de Testing y una WeakEntity de Calendar; sus vistas consumen Remote.
Se mantienen juntos inicialmente en hub-services. Separarlos artificialmente
crearía ciclos o exigiría reescribir sus comunicaciones. Ajustes implementa
métodos de Hub y queda junto a la shell. Son agrupaciones explícitas, no APIs
genéricas nuevas. El contexto CurrentScene se separa del capturador de ventana
para que los módulos no dependan de la shell ni del proceso Hub.

Los módulos extraídos no podrán depender de hub ni hub-shell. Esto permite
que otro host componga esas vistas después. No se añade ahora control desde
overlays. Los modelos de producto siguen en sus crates actuales; la dependencia
existente de los pintores de ui se conserva, sin duplicar renderizadores.

## Orden y verificación

1. Tooling y CI; mantener los nombres de los checks obligatorios.
2. Orbit y activos compartidos.
3. Contratos comunes, Launcher y navegación.
4. Servicios y módulos de producto en cortes pequeños.
5. Shell; verificar fachada, parity-capture, presupuestos y arquitectura.

Cada corte necesita fmt, Clippy y tests de los crates afectados. El conjunto
final requiere suite completa, telemetría y lifecycle. Las mediciones se hacen
en serie, con el mismo target, jobs y perfil indicados en la evidencia.
No se estima rendimiento de un Mac sin medirlo y no se accede por SSH.

## Flujo de compilación

`native/scripts/comprobar.ps1 <crate>` selecciona el crate y sus dependientes
directos. La CI de PR selecciona dependientes transitivos; en push/nightly y
merge_group valida el workspace. Los cambios globales fuerzan el workspace.
Clippy comprueba también los tipos y conserva el banco bench de Runtime.
Nextest reúne suite y corpus cuando corresponde; lifecycle conserva su arnés.
La cola conserva como máximo dos compilaciones y asigna targets estables en
`D:/VantareServer/targets/slot-0` y `slot-1`, reutilizados entre ramas.
El slot se limpia antes de usarlo si supera 20 GB o lleva 14 días sin usarse;
solo bajo su mutex, sin enlaces y sin locks Cargo abiertos.

## Evidencia

En curso. Logs locales: `D:/VantareServer/evidence/isa-1993`.
No confundir un check en frío con un build que genera ejecutables.
