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
use super::fixed::Fixed;
use super::greedy::Span;
use super::{FixedStop, Input, Resource, amount};

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
/// que no se completa aun llevando siempre el nivel más alto posible. `None`:
/// en el mejor caso se completan todas las vueltas y lo que falta es la reserva.
fn fail_lap(
    resource: Resource,
    stints: &[u32],
    fixed: &impl Fn(usize) -> Option<i64>,
    stop: usize,
    arrival: Span,
) -> Option<u32> {
    let mut done: u32 = stints[..=stop].iter().sum();
    let mut level = arrival.serviced(resource, fixed(stop))?;
    for stint in stop + 1..stints.len() {
        let after = level.driven(resource, i64::from(stints[stint]));
        if after.hi < 0 {
            // `per_lap` no es cero: con consumo cero el nivel no baja.
            let completed = u32::try_from(level.hi / resource.per_lap).ok()?;
            return Some(done + completed + 1);
        }
        done += stints[stint];
        if stint + 1 < stints.len() {
            level = after.serviced(resource, fixed(stint))?;
        }
    }
    None
}
