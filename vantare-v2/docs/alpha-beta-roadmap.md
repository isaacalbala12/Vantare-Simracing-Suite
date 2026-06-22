# Alpha/Beta Roadmap

Este documento resume la estrategia alpha/beta. La fuente operativa principal es `docs/master-feature-plan.md`.

## Versiones

- `0.1.X.X`: pre-alpha/foundation.
- `0.2.X.X` a `0.3.X.X`: alpha privada.
- `0.4.X.X` a `0.5.X.X`: beta privada de testers.
- `0.6.X.X` a `0.9.X.X`: beta publica de pago.
- `1.0.0.0`: release estable.

Detalles de versionado: `docs/versioning-and-release-gates.md`.

## Alpha privada

Usuarios:

- usuario principal;
- testers cercanos.

Debe cerrar:

- producto usable en LMU;
- `LayoutStudio` con mover/redimensionar;
- rework UI de Overlays Studio;
- `Relative` completo;
- `Standings` completo excepto multiclase;
- perfiles locales;
- recomendado -> copia editable;
- mock/live/demo entendible;
- overlay desktop;
- checklist manual.

No bloquea:

- OBS;
- delta best;
- hotkeys;
- `Pedals`;
- pagos;
- multisimulador.

## Beta privada de testers

Debe cerrar:

- build compartible;
- instrucciones;
- canal de feedback;
- OBS local sencillo;
- hotkeys basicas;
- delta best live;
- `Pedals` beta v1;
- recomendados pulidos.

No entra de momento:

- doble PC/LAN como requisito;
- companion app;
- pagos;
- cuentas;
- multisimulador estable.

## Beta publica de pago

Debe cerrar:

- Stripe o checkout externo;
- mecanismo de acceso/licencia;
- instalacion/update clara;
- `Relative`, `Standings` y `Pedals` estables;
- OBS/desktop robustos;
- docs publicas minimas;
- soporte/feedback.

Puede entrar:

- layouts por sesion;
- data blocks simples;
- OBS LAN si se decide.

No debe prometer:

- multisimulador completo;
- community layouts;
- companion app.

## Release

Debe cerrar:

- LMU solido;
- pago/acceso estable;
- performance validada;
- docs usuario;
- regression suite minima;
- soporte organizado.
