//! Límites de lo que se puede fijar a mano en cada parada (#2692, #2709).
//!
//! Con el calendario fijo de «Ajustar paradas», combustible y energía no
//! dependen uno del otro: cada recurso tiene plan si sus niveles cuadran a lo
//! largo de los tramos. Por eso los límites se dan por recurso.
//!
//! El modelo es el del recálculo: se sale con el depósito lleno, cada parada
//! carga un número entero de pasos sin pasar de la capacidad y lo fijado se
//! carga tal cual. Los niveles con los que se puede llegar a una parada son los
//! mismos del plan de respaldo ([`Span`]). Aquí se añade la cuenta hacia atrás:
//! con cuánto hay que salir de cada parada, como poco y como mucho, para que el
//! resto de la carrera tenga plan.
//!
//! Todos los niveles posibles en una vuelta están en la misma «escalera» de la
//! rejilla (capacidad menos lo gastado, más pasos enteros), así que lo que
//! admite una parada es siempre un tramo seguido de la rejilla, o nada.
//!
//! Las ruedas van aparte (#2743): no dependen de la rejilla ni de los niveles.
//! Unas ruedas aguantan mientras las vueltas que llevan no pasen de su vida,
//! así que basta contar, parada a parada, las vueltas desde el último cambio.
use super::fixed::Fixed;
use super::greedy::Span;
use super::{FixedStop, Input, Resource, amount, units};

/// Un tramo de litros o de puntos porcentuales, con los dos extremos dentro.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AmountRange {
    pub min: f64,
    pub max: f64,
}

/// Qué le pasa a una cantidad fijada que no deja plan.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FixedProblem {
    /// Es poco: ni cargando lo máximo en las paradas automáticas se llega.
    /// `fail_lap` es la primera vuelta que no se completa en el mejor caso;
    /// `None` cuando se llega a meta pero sin la reserva pedida.
    BelowMin { fail_lap: Option<u32> },
    /// Es demasiado: no cabe, o impide que quepa lo fijado en una parada posterior.
    AboveMax,
    /// Con lo demás como está, ninguna cantidad en esta parada da plan.
    NoRange,
}

/// Los límites de un recurso en una parada.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ResourceBounds {
    /// Niveles con los que se puede llegar a la parada, antes de cargar.
    /// `None`: con lo fijado antes no se llega.
    pub arrival: Option<AmountRange>,
    /// Cantidades de la rejilla que se pueden fijar en esta parada para que el
    /// recurso tenga plan, con el calendario y lo fijado en las demás paradas.
    /// No depende de lo que haya fijado en esta misma parada. `None`: ninguna.
    pub service: Option<AmountRange>,
    /// Lo que le pasa a la cantidad fijada hoy en esta parada. `None` si es
    /// automática o está dentro de `service`.
    pub problem: Option<FixedProblem>,
}

/// Los límites de una parada.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StopBounds {
    pub fuel: ResourceBounds,
    pub ve: ResourceBounds,
}

/// Las ruedas en una parada: las vueltas que llevan y si aguantan sin cambiarse.
///
/// Vale para el cálculo del Hub, que monta ruedas nuevas en toda parada que no
/// tenga fijado seguir con las mismas. Con inventario físico de neumáticos la
/// búsqueda puede no cambiarlas por su cuenta y esta cuenta no la describe.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TyreBounds {
    /// Vida máxima de unas ruedas, en vueltas. `None`: sin límite.
    pub life_laps: Option<u32>,
    /// Vueltas que llevan las ruedas al llegar a la parada, con lo fijado en
    /// las paradas anteriores.
    pub arrival_laps: u32,
    /// Vueltas que llevarían al acabar el tramo siguiente si en esta parada no
    /// se cambian. Ni esta cuenta ni `arrival_laps` dependen de lo fijado en
    /// esta parada o en las posteriores.
    pub kept_laps: u32,
    /// En esta parada está fijado no cambiar y `kept_laps` pasa de la vida:
    /// así no hay plan.
    ///
    /// Solo culpa a las ruedas si el calendario tiene plan sin fijar nada. Si
    /// no lo tiene (por ejemplo, tramos de 10 y 2 vueltas con una vida de 8:
    /// el primer tramo ya no cabe), la marca puede salir igual en una parada
    /// sin cambio, pero la causa es el calendario y el recálculo no señala
    /// parada (`unreachable_stop` es `None`). Quien enseñe la marca no debe
    /// culpar entonces a las ruedas.
    pub beyond_life: bool,
}

/// Las ruedas de cada parada del calendario `stints` (una parada entre cada
/// dos tramos). La edad vuelve a cero en toda parada que no tenga fijado
/// seguir con las mismas ruedas.
pub(crate) fn stop_tyres(
    input: &Input,
    stints: &[u32],
    fixed: &[FixedStop],
) -> Result<Vec<TyreBounds>, String> {
    // La vida como la lee el cálculo: vueltas enteras, y cero es «sin límite».
    let life_laps = if input.tyre_life_laps.value > 0.0 {
        Some(
            u32::try_from(units(input.tyre_life_laps.value)? / 1_000_000)
                .map_err(|error| error.to_string())?,
        )
    } else {
        None
    };
    let keeps = |stop: usize| {
        fixed
            .get(stop)
            .is_some_and(|fixed| fixed.change_tyres == Some(false))
    };
    // Vueltas que llevan las ruedas al empezar el tramo.
    let mut age = 0_u32;
    Ok(stints
        .windows(2)
        .enumerate()
        .map(|(stop, laps)| {
            let arrival_laps = age.saturating_add(laps[0]);
            let kept_laps = arrival_laps.saturating_add(laps[1]);
            age = if keeps(stop) { arrival_laps } else { 0 };
            TyreBounds {
                life_laps,
                arrival_laps,
                kept_laps,
                beyond_life: keeps(stop) && life_laps.is_some_and(|life| kept_laps > life),
            }
        })
        .collect())
}

/// Límites de cada parada del calendario `stints` (una parada entre cada dos
/// tramos). `input` es la entrada escalar; quien llama ya comprobó que lo es.
pub(crate) fn stop_bounds(
    input: &Input,
    stints: &[u32],
    fixed: &[FixedStop],
) -> Result<Vec<StopBounds>, String> {
    let fuel = Resource::new(
        input.fuel_capacity_liters.value,
        input.fuel_per_lap_liters.value,
        input.discretization.fuel_liters,
        &input.fuel_reserve,
        input.race_laps,
    )?;
    let ve = Resource::new(
        input.ve_capacity_percent.value,
        input.ve_per_lap_percent.value,
        input.discretization.ve_percent,
        &input.virtual_energy_reserve,
        input.race_laps,
    )?;
    let fixed = Fixed::new(fixed, fuel, ve).map_err(|invalid| invalid.to_string())?;
    let fuel = resource_bounds(fuel, stints, |stop| fixed.at(stop).0);
    let ve = resource_bounds(ve, stints, |stop| fixed.at(stop).1);
    Ok(fuel
        .into_iter()
        .zip(ve)
        .map(|(fuel, ve)| StopBounds { fuel, ve })
        .collect())
}

/// Mayor nivel de la escalera de `level` que no pasa de `limit`.
fn at_most(resource: Resource, level: i64, limit: i64) -> i64 {
    limit - (limit - level).rem_euclid(resource.step)
}

/// Menor nivel de la escalera de `level` que no baja de `limit`.
fn at_least(resource: Resource, level: i64, limit: i64) -> i64 {
    limit + (level - limit).rem_euclid(resource.step)
}

fn range(span: Span) -> AmountRange {
    AmountRange {
        min: amount(span.lo),
        max: amount(span.hi),
    }
}

fn resource_bounds(
    resource: Resource,
    stints: &[u32],
    fixed: impl Fn(usize) -> Option<i64>,
) -> Vec<ResourceBounds> {
    let stops = stints.len().saturating_sub(1);
    let used = |stint: usize| i64::from(stints[stint]) * resource.per_lap;

    // Hacia delante: niveles con los que se llega a cada parada. En cuanto un
    // tramo no se puede completar ni saliendo con lo máximo, o una cantidad
    // fijada no cabe ni llegando con lo mínimo, a las siguientes no se llega.
    let mut arrivals: Vec<Option<Span>> = vec![None; stops];
    let mut level = Some(Span {
        lo: resource.capacity,
        hi: resource.capacity,
    });
    for stop in 0..stops {
        let Some(start) = level else { break };
        let arrival = start.driven(resource, i64::from(stints[stop]));
        if arrival.hi < 0 {
            break;
        }
        arrivals[stop] = Some(arrival);
        level = arrival.serviced(resource, fixed(stop));
    }

    // Hacia atrás: niveles con los que hay que salir de cada parada para que lo
    // que queda de carrera tenga plan. `wanted[stop]` es el tramo válido al
    // empezar el tramo `stop + 1`, ya en la escalera de esa vuelta.
    let mut wanted: Vec<Option<Span>> = vec![None; stops];
    let mut done: i64 = stints.iter().map(|&laps| i64::from(laps)).sum();
    let mut next: Option<Span> = None;
    for stop in (0..stops).rev() {
        let stint = stop + 1;
        done -= i64::from(stints[stint]);
        // Un nivel cualquiera de la escalera en la vuelta de esta parada.
        let ladder = resource.capacity - done * resource.per_lap;
        let needed = if stint == stops {
            // Último tramo: llegar a meta con la reserva.
            Some((used(stint) + resource.reserve, resource.capacity))
        } else {
            // Al final de este tramo se llega a la parada `stint`. Una automática
            // sube lo que falte, así que vale llegar con cualquier nivel que no
            // pase del máximo; una fijada solo suma su cantidad.
            next.and_then(|after| {
                let (lo, hi) = match fixed(stint) {
                    None => (0, after.hi),
                    Some(amount) => ((after.lo - amount).max(0), after.hi - amount),
                };
                (lo <= hi).then(|| (lo + used(stint), (hi + used(stint)).min(resource.capacity)))
            })
        };
        next = needed
            .map(|(lo, hi)| Span {
                lo: at_least(resource, ladder, lo),
                hi: at_most(resource, ladder, hi),
            })
            .filter(|span| span.lo <= span.hi);
        wanted[stop] = next;
    }

    (0..stops)
        .map(|stop| {
            // Hay cantidad válida si algún nivel de llegada, más ella, cae en
            // el tramo que pide el resto de la carrera.
            let service = match (arrivals[stop], wanted[stop]) {
                (Some(arrival), Some(wanted)) if arrival.lo <= wanted.hi => Some(Span {
                    lo: (wanted.lo - arrival.hi).max(0),
                    hi: wanted.hi - arrival.lo,
                }),
                _ => None,
            };
            let problem = fixed(stop).and_then(|amount| match service {
                None => Some(FixedProblem::NoRange),
                Some(service) if amount > service.hi => Some(FixedProblem::AboveMax),
                Some(service) if amount < service.lo => Some(FixedProblem::BelowMin {
                    fail_lap: arrivals[stop]
                        .and_then(|arrival| fail_lap(resource, stints, &fixed, stop, arrival)),
                }),
                Some(_) => None,
            });
            ResourceBounds {
                arrival: arrivals[stop].map(range),
                service: service.map(range),
                problem,
            }
        })
        .collect()
}

/// Con una cantidad fijada que es poco en la parada `stop`: la primera vuelta
/// que no se completa aun llevando siempre el nivel más alto posible. `None`
/// solo cuando en el mejor caso se completan todas las vueltas y lo que falta
/// es la reserva.
///
/// Con poco, el mejor caso solo puede acabar de esas dos maneras. No puede
/// tropezar con una cantidad fijada que no quepa más adelante: salir con menos
/// nivel solo deja más hueco, y saliendo con más (dentro de `service`) cabe. Aun
/// así esa rama está escrita y no responde `None`: si algún día se diera, la
/// vuelta que no se completa es la siguiente a esa parada.
fn fail_lap(
    resource: Resource,
    stints: &[u32],
    fixed: &impl Fn(usize) -> Option<i64>,
    stop: usize,
    arrival: Span,
) -> Option<u32> {
    let mut done: u32 = stints[..=stop].iter().sum();
    let Some(mut level) = arrival.serviced(resource, fixed(stop)) else {
        debug_assert!(false, "una cantidad menor que el mínimo cabe");
        return Some(done + 1);
    };
    for (stint, &laps) in stints.iter().enumerate().skip(stop + 1) {
        let after = level.driven(resource, i64::from(laps));
        if after.hi < 0 {
            // Con consumo cero el nivel no baja: aquí `per_lap` no es cero.
            let completed = level
                .hi
                .checked_div(resource.per_lap)
                .and_then(|completed| u32::try_from(completed).ok())
                .map_or(0, |completed| completed.min(laps - 1));
            return Some(done + completed + 1);
        }
        done += laps;
        if stint + 1 == stints.len() {
            debug_assert!(
                after.hi < resource.reserve,
                "con menos del mínimo no se llega a meta con la reserva"
            );
            return None;
        }
        let Some(serviced) = after.serviced(resource, fixed(stint)) else {
            debug_assert!(false, "saliendo con menos, lo fijado después cabe");
            return Some(done + 1);
        };
        level = serviced;
    }
    debug_assert!(false, "después de una parada siempre hay un tramo");
    Some(done + 1)
}
