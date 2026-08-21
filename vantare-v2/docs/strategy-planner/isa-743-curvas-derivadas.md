# ISA-743 — contrato numérico de curvas derivadas

Estado: implementado en la rama de la issue, pendiente de review e integración.

## Entradas y frontera

La derivación consume las vueltas, etiquetas, fronteras y stints de F3-a2 y
las observaciones limpias de ritmo, consumo y bucket de F3-a3. No reconstruye
vueltas, stints, clima ni ritmo. La agregación solo admite la misma combinación
y conserva separado cada bucket de clima.

## Curva combinada

Para cada stint y bucket se toma la mediana de sus primeras tres vueltas
limpias como cero local. Cada vuelta conserva su índice real dentro del stint:
una vuelta excluida no comprime la edad. La curva agregada calcula, para cada
índice, la mediana de los deltas de los stints disponibles y publica mínimo,
máximo y N. Esta es siempre una observación combinada; no se interpreta como
desgaste causal.

## Gate de separabilidad fuel/edad

Las curvas separadas solo se publican cuando pasan simultáneamente estos
criterios, calculados dentro de una combinación y bucket:

- al menos 3 stints y 15 vueltas limpias con Fuel conocido;
- al menos 3 índices de vuelta compartidos por 3 stints, cada uno con un rango
  de Fuel de 10 L o más;
- `abs(corr(Fuel, edad)) <= 0,80`;
- al menos 25 % de la varianza de Fuel permanece después de retirar su tendencia
  lineal con la edad.

Solo después se ajusta `tiempo = intercepto + betaFuel*Fuel + betaEdad*edad`.
Un diseño singular falla cerrado. La fixture cruzada recupera ambos efectos;
la fixture sintética tipo corpus real, con Fuel y edad colineales, queda
`combined_only` y no materializa ninguna curva separada. El resultado del gate
incluye razón, N, número de stints, edades cruzadas, correlación y fracción de
varianza residual.

## Tyres Wear

`Tyres Wear` se lee a 10 Hz en el orden documentado FL/FR/RL/RR. En cada vuelta
admitida por F3-a2 se calcula `wear_inicio - wear_fin` en puntos porcentuales
por vuelta. Se publican medias por rueda y eje, rango observado, varianza y N.
La vida restante por rueda usa el último valor observado y el umbral explícito
del 20 %; la estimación familiar es el mínimo conservador y también conserva el
rango entre ruedas.

No se publica desgaste por compuesto: `TyresCompound` conserva códigos 0–2 sin
mapping semántico, por lo que esa presencia es `unsupported` con motivo. No se
deriva nada por esquina.

## Coste del ahorro

La curva solo aparece cuando existe, dentro del mismo stint, bucket y vector de
compuesto, exactamente un par de niveles con al menos 5 vueltas limpias por
nivel y la secuencia alterna nivel a nivel. El nivel de mayor consumo es la
referencia; para cada código se publica combustible ahorrado y coste temporal
medio por vuelta.

Sin niveles, compuesto, N suficiente o alternancia, la familia queda `missing`
con una razón estable. Diez vueltas agrupadas 5+5 pero no alternadas no pasan.
