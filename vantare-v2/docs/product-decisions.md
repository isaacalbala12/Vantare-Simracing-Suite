# Product Decisions

Registro de decisiones de producto tomadas durante la planificacion.

## Decisiones cerradas

### Alpha privada incluye testers cercanos

Decision:

La alpha privada no es solo uso interno. Incluye testers cercanos.

Impacto:

- necesita UX mas clara que una build solo interna;
- necesita checklist manual;
- necesita build o instrucciones razonables;
- no exige todavia OBS ni pagos.

### Producto usable antes de seguir ampliando widgets

Decision:

Antes de ampliar configuracion profunda a mas widgets, hay que cerrar producto usable.

Producto usable significa:

- app arranca;
- layout se puede editar;
- widgets se pueden mover/redimensionar;
- perfiles se guardan;
- recomendados se pueden copiar;
- overlay desktop funciona;
- mock/live/demo se entiende;
- `Relative` y `Standings` estan completos para la fase.

### Relative y Standings son core de alpha

Decision:

`Relative` y `Standings` deben tener toda la capa de personalizacion completa funcional antes de cerrar alpha privada, excepto multiclase.

Impacto:

- `Standings` es siguiente corte core;
- no expandir otros widgets antes de esto;
- multiclase queda fuera de alpha privada.

### Rework UI de Overlays Studio entra en alpha privada

Decision:

La UI actual de Overlays Studio no debe dejarse para el final.

Impacto:

- se usara un HTML de referencia aportado por el usuario como guia visual;
- el HTML es solo diseno, no arquitectura;
- el rework no debe romper responsabilidades.

### Pedals entra en beta testers

Decision:

`Pedals` debe entrar en beta testers.

Alcance inicial:

- throttle;
- brake;
- clutch;
- diseno nuevo mas pequeno.

Fuera:

- steering;
- templates complejos;
- telemetria avanzada.

### OBS doble PC queda para futuro

Decision:

OBS por LAN/doble PC y companion app no entran en beta testers de momento.

Impacto:

- beta testers puede tener OBS local sencillo;
- doble PC se registra como futuro;
- companion app queda como futurible.

### LMU-first

Decision:

LMU sigue siendo el foco hasta cerrar alpha/beta.

Impacto:

- iRacing/AC no entran antes de pago salvo investigacion aislada;
- no prometer multisimulador como argumento principal inicial.

### Delta best pasa a beta testers

Decision:

Delta best live fiable no bloquea alpha privada.

Impacto:

- entra en beta testers;
- no debe distraer del cierre de producto usable.

### LayoutStudio bloquea alpha privada

Decision:

Drag & drop y resize en `LayoutStudio` son bloqueantes de alpha privada.

Impacto:

- hay que verificar o implementar antes de cerrar alpha;
- `WidgetStudio` no puede asumir esa responsabilidad.

### OBS local entra despues de alpha privada

Decision:

OBS no bloquea alpha privada.

Impacto:

- OBS setup local entra en beta testers;
- overlay desktop basta para alpha privada.

### Pago con Stripe/checkout externo

Decision:

La beta publica de pago usara Stripe o checkout externo.

Impacto:

- no construir sistema de billing complejo al principio;
- queda pendiente decidir validacion de acceso/licencia.

## Decisiones pendientes

### Acceso/licencia para beta publica

Opciones:

- licencia/key local;
- cuenta simple;
- acceso por build privado;
- validacion remota ligera.

Se decide antes de `0.6.X.X`.

### Detalle exacto del rework UI

Pendiente:

- leer HTML de referencia;
- ruta de referencia actual: `C:\Users\isaac\Desktop\Vantare-Overlays\overlays_mockup.html`;
- decidir flujo visual;
- crear miniplan de UI;
- confirmar que no cambia arquitectura.

### Standings: datos fiables por metrica

Pendiente:

- inventariar datos disponibles;
- marcar metricas `stable`, `tester` o `unavailable`;
- no inventar datos.

### Pedals: diseno nuevo pequeno

Pendiente:

- definir mock visual;
- confirmar datos disponibles;
- decidir configuracion minima.

### Doble PC

Pendiente:

- decidir si OBS LAN entra en `0.8.X.X` o post-release;
- companion app queda post-release salvo decision contraria.
