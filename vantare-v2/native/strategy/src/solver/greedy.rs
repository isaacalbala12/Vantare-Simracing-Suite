//! Greedy fallback plan for the scalar model (#2627).
//!
//! Longest stints that fit the tank, the battery and the tyres, refuelling just
//! enough, stopping no later than each required window's last lap. It is
//! deterministic, has no search and no clock, and returns a plan only when every
//! rule of the input holds; otherwise it names the rule it cannot meet.
//!
//! Con cantidades fijadas a mano (#2690) el plan se hace en tres pasos:
//!
//! 1. Hacia delante se eligen los tramos como siempre (el más largo posible),
//!    llevando por recurso el nivel mínimo y máximo con el que se puede llegar a
//!    cada parada. Lo fijado es múltiplo del paso, así que todos los niveles
//!    posibles en una vuelta están en la misma «escalera» de la rejilla y forman
//!    un tramo continuo: con el mínimo y el máximo basta, sin aproximar.
//! 2. Hacia atrás se calcula cuánto hay que llevar al empezar cada tramo para
//!    cubrir lo que viene, incluidas las paradas fijadas que cargan poco.
//! 3. Hacia delante cada parada automática carga lo justo para eso.
//!
//! Sin nada fijado, los tres pasos hacen las mismas cuentas que el plan de un
//! solo paso anterior (lo vigilan las huellas de `tests/unfixed_fingerprints.rs`).
//!
//! El respaldo monta ruedas nuevas en todas las paradas, salvo donde esté
//! fijado seguir con las mismas (#2691). Ahí la edad de las ruedas sigue: el
//! paso 1 no deja que un grupo de tramos unidos por paradas sin cambio pase de
//! la vida máxima, y el desgaste de esos tramos se acumula.
use super::fixed::Fixed;
use super::{
    FixedStop, GreedyRefusal, Input, OptimalityStatus, PitStop, Resource, ResultV2, SolverOutcome,
    amount, pit_seconds, resource_balance, runs_extended_search, solver_outcome, units,
};

pub(super) fn solve(input: &Input, fixed: &[FixedStop]) -> Result<SolverOutcome, GreedyRefusal> {
    if runs_extended_search(input) {
        return Err(GreedyRefusal::NotScalar);
    }
    let resource = |capacity: f64, per_lap: f64, step: f64, reserve| {
        Resource::new(capacity, per_lap, step, reserve, input.race_laps)
            .map_err(|_| GreedyRefusal::ServiceGrid)
    };
    let fuel = resource(
        input.fuel_capacity_liters.value,
        input.fuel_per_lap_liters.value,
        input.discretization.fuel_liters,
        &input.fuel_reserve,
    )?;
    let ve = resource(
        input.ve_capacity_percent.value,
        input.ve_per_lap_percent.value,
        input.discretization.ve_percent,
        &input.virtual_energy_reserve,
    )?;
    let fixed = Fixed::new(fixed, fuel, ve).map_err(|_| GreedyRefusal::ServiceGrid)?;
    let refusal = match build(input, fuel, ve, &fixed) {
        Ok(outcome) => return Ok(outcome),
        Err(refusal) => refusal,
    };
    if fixed.is_empty() {
        return Err(refusal);
    }
    // ¿Es culpa de lo fijado? Si sin fijar nada tampoco hay plan, la causa es la
    // de siempre. Si lo hay, se señala la primera parada fijada con la que deja
    // de haberlo, manteniendo las anteriores.
    build(input, fuel, ve, &Fixed::default())?;
    for stop in fixed.stops() {
        if build(input, fuel, ve, &fixed.up_to(stop)).is_err() {
            return Err(GreedyRefusal::FixedAmountUnreachable { stop });
        }
    }
    Err(refusal)
}

fn build(
    input: &Input,
    fuel: Resource,
    ve: Resource,
    fixed: &Fixed,
) -> Result<SolverOutcome, GreedyRefusal> {
    let rules = &input.event_rules;
    // Un plan que respeta lo fijado tiene al menos las paradas fijadas.
    let minimum = rules.min_pit_stops.unwrap_or(0).max(fixed.required_stops());
    let race = usize::try_from(input.race_laps).map_err(|_| GreedyRefusal::ServiceGrid)?;
    if minimum >= race {
        return Err(GreedyRefusal::MinStops);
    }
    // Shorter stints add stops: lower the stint cap until the minimum is met.
    let mut cap = u32::MAX;
    let mut candidate = loop {
        let plan = plan(input, fuel, ve, cap, fixed)?;
        if plan.pit_stops.len() >= minimum {
            break plan;
        }
        let longest = plan.stints.iter().copied().max().unwrap_or(1);
        if longest <= 1 {
            return Err(GreedyRefusal::MinStops);
        }
        // `minimum` stops need `minimum + 1` stints: an even split is the first try.
        let even = input
            .race_laps
            .div_ceil(u32::try_from(minimum + 1).unwrap_or(u32::MAX));
        cap = even.min(longest - 1);
    };
    candidate.feasible = true;
    let (start, remaining) =
        resource_balance(&candidate, fuel, true).map_err(|_| GreedyRefusal::ServiceGrid)?;
    candidate.fuel_start_liters = amount(start);
    candidate.fuel_remaining_liters = amount(remaining);
    let (start, remaining) =
        resource_balance(&candidate, ve, false).map_err(|_| GreedyRefusal::ServiceGrid)?;
    candidate.ve_start_percent = amount(start);
    candidate.ve_remaining_percent = amount(remaining);
    let mut outcome = solver_outcome(
        candidate,
        OptimalityStatus::NotProven,
        0,
        Some("greedy_fallback_plan"),
    );
    outcome.certificate.fixed_stops = fixed.stops().count();
    Ok(outcome)
}

/// Nivel más alto de la rejilla al que se puede subir desde `level`.
fn top(resource: Resource, level: i64) -> i64 {
    level + (resource.capacity - level) / resource.step * resource.step
}

/// `amount` redondeado hacia arriba a un número entero de pasos.
fn whole_steps(resource: Resource, amount: i64) -> i64 {
    (amount + resource.step - 1) / resource.step * resource.step
}

/// Vueltas que cubre un nivel dejando `keep` (la reserva en meta; cero en carrera).
fn laps_with(resource: Resource, level: i64, keep: i64) -> u32 {
    if resource.per_lap == 0 {
        return u32::MAX;
    }
    u32::try_from(((level - keep) / resource.per_lap).max(0)).unwrap_or(u32::MAX)
}

/// Niveles de un recurso alcanzables en un punto de la carrera, según lo que
/// carguen las paradas automáticas anteriores: todos los de la «escalera» de la
/// rejilla entre `lo` y `hi`.
#[derive(Clone, Copy)]
pub(super) struct Span {
    pub lo: i64,
    pub hi: i64,
}

impl Span {
    /// Tras el servicio de una parada. `None`: la cantidad fijada no cabe ni
    /// llegando con el nivel más bajo posible.
    pub(super) fn serviced(self, resource: Resource, fixed: Option<i64>) -> Option<Self> {
        let Some(amount) = fixed else {
            // Automática: desde no cargar nada hasta el tope de la rejilla.
            return Some(Self {
                lo: self.lo,
                hi: top(resource, self.lo),
            });
        };
        if self.lo + amount > resource.capacity {
            return None;
        }
        // Para que quepa hay que llegar con hueco: el nivel más alto que lo deja.
        let excess = (self.hi + amount - resource.capacity).max(0);
        Some(Self {
            lo: self.lo + amount,
            hi: self.hi - whole_steps(resource, excess) + amount,
        })
    }

    /// Tras un tramo. Quien llegaría por debajo de cero tuvo que cargar antes:
    /// el mínimo es el nivel más bajo de la escalera que no es negativo.
    pub(super) fn driven(self, resource: Resource, laps: i64) -> Self {
        let used = laps * resource.per_lap;
        let lo = self.lo - used;
        Self {
            lo: if lo < 0 {
                lo + whole_steps(resource, -lo)
            } else {
                lo
            },
            hi: self.hi - used,
        }
    }
}

/// Paso 1: los tramos. Los más largos que caben, parando como muy tarde en la
/// última vuelta de cada ventana pendiente.
fn calendar(
    input: &Input,
    fuel: Resource,
    ve: Resource,
    cap: u32,
    fixed: &Fixed,
) -> Result<Vec<u32>, GreedyRefusal> {
    let rules = &input.event_rules;
    let tyres = if input.tyre_life_laps.value > 0.0 {
        u32::try_from(
            units(input.tyre_life_laps.value).map_err(|_| GreedyRefusal::ServiceGrid)? / 1_000_000,
        )
        .unwrap_or(u32::MAX)
    } else {
        u32::MAX
    };
    let mut stints: Vec<u32> = Vec::new();
    // Vueltas que llevan las ruedas montadas al empezar el tramo (#2691). Es
    // cero salvo tras una parada en la que está fijado no cambiarlas.
    let mut age = 0u32;
    let mut met = vec![false; rules.required_windows.len()];
    // Niveles con los que se llega a la vuelta `done`, antes del servicio.
    let at_start = |resource: Resource| Span {
        lo: resource.capacity,
        hi: resource.capacity,
    };
    let (mut fuel_span, mut ve_span) = (at_start(fuel), at_start(ve));
    let mut done = 0u32;
    loop {
        let remaining = input.race_laps - done;
        // A las ruedas les queda su vida menos lo que ya llevan, y tienen que
        // durar también los tramos que siguen sin cambio: una vuelta, al
        // menos, para cada uno.
        let kept_ahead = (stints.len()..fixed.required_stops())
            .take_while(|&stop| fixed.keeps_tyres(stop))
            .count();
        let longest = tyres
            .saturating_sub(age)
            .saturating_sub(u32::try_from(kept_ahead).unwrap_or(u32::MAX))
            .min(cap);
        // En la salida no hay parada; después, la de la vuelta `done`.
        let (fuel_after, ve_after) = if done == 0 {
            (fuel_span, ve_span)
        } else {
            let stop = stints.len() - 1;
            let (fixed_fuel, fixed_ve) = fixed.at(stop);
            let unreachable = GreedyRefusal::FixedAmountUnreachable { stop };
            (
                fuel_span.serviced(fuel, fixed_fuel).ok_or(unreachable)?,
                ve_span.serviced(ve, fixed_ve).ok_or(unreachable)?,
            )
        };
        let reach = longest
            .min(laps_with(fuel, fuel_after.hi, 0))
            .min(laps_with(ve, ve_after.hi, 0));
        let reach_final = longest
            .min(laps_with(fuel, fuel_after.hi, fuel.reserve))
            .min(laps_with(ve, ve_after.hi, ve.reserve));
        let deadline = rules
            .required_windows
            .iter()
            .zip(&met)
            .filter(|(_, met)| !**met)
            .map(|(window, _)| window.to_lap)
            .min();
        let (length, last) = if deadline.is_none() && remaining <= reach_final {
            (remaining, true)
        } else {
            if reach == 0 {
                return Err(GreedyRefusal::ResourceTooSmall);
            }
            let mut stop = done.saturating_add(reach).min(input.race_laps - 1);
            if let Some(deadline) = deadline {
                if deadline <= done {
                    return Err(GreedyRefusal::WindowUnreachable);
                }
                stop = stop.min(deadline);
            }
            if stop <= done {
                return Err(GreedyRefusal::ResourceTooSmall);
            }
            (stop - done, false)
        };
        // La parada que cierra este tramo tiene el número `stints.len()`.
        age = if fixed.keeps_tyres(stints.len()) {
            age + length
        } else {
            0
        };
        stints.push(length);
        done += length;
        if last {
            return Ok(stints);
        }
        if rules.max_pit_stops.is_some_and(|max| stints.len() > max) {
            return Err(GreedyRefusal::MaxStops);
        }
        for (index, window) in rules.required_windows.iter().enumerate() {
            if (window.from_lap..=window.to_lap).contains(&done) {
                met[index] = true;
            }
        }
        fuel_span = fuel_after.driven(fuel, i64::from(length));
        ve_span = ve_after.driven(ve, i64::from(length));
    }
}

/// Paso 2: nivel que hay que llevar al empezar cada tramo. Una parada automática
/// puede cargar lo que falte, así que antes de ella no hace falta llevar nada de
/// más; una fijada solo aporta su cantidad y el resto tiene que venir de antes.
fn needs(resource: Resource, stints: &[u32], fixed: impl Fn(usize) -> Option<i64>) -> Vec<i64> {
    let mut needs = vec![0; stints.len()];
    let mut arrival = resource.reserve;
    for index in (0..stints.len()).rev() {
        needs[index] = i64::from(stints[index]) * resource.per_lap + arrival;
        if index > 0 {
            arrival = fixed(index - 1).map_or(0, |amount| (needs[index] - amount).max(0));
        }
    }
    needs
}

/// Paso 3: carga de una parada. La automática, lo justo en la rejilla para
/// llegar a `needed`; la fijada, su cantidad.
fn service(
    resource: Resource,
    level: i64,
    needed: i64,
    fixed: Option<i64>,
) -> Result<i64, GreedyRefusal> {
    if let Some(amount) = fixed {
        // Defensa: el paso 1 ya comprobó que cabe y que alcanza.
        if level + amount > resource.capacity || level + amount < needed {
            return Err(GreedyRefusal::ServiceGrid);
        }
        return Ok(amount);
    }
    if resource.per_lap == 0 || needed <= level {
        return Ok(0);
    }
    let service = whole_steps(resource, needed - level);
    if level + service > resource.capacity {
        return Err(GreedyRefusal::ServiceGrid);
    }
    Ok(service)
}

fn plan(
    input: &Input,
    fuel: Resource,
    ve: Resource,
    cap: u32,
    fixed: &Fixed,
) -> Result<ResultV2, GreedyRefusal> {
    let stints = calendar(input, fuel, ve, cap, fixed)?;
    let fuel_needs = needs(fuel, &stints, |stop| fixed.at(stop).0);
    let ve_needs = needs(ve, &stints, |stop| fixed.at(stop).1);
    let mut result = ResultV2::default();
    let (mut fuel_level, mut ve_level) = (fuel.capacity, ve.capacity);
    let mut done = 0u32;
    // Vueltas que llevan las ruedas montadas al empezar el tramo.
    let mut age = 0u32;
    let mut service_seconds = 0.0;
    for (index, &length) in stints.iter().enumerate() {
        let count = i64::from(length);
        if index > 0 {
            let (fixed_fuel, fixed_ve) = fixed.at(index - 1);
            let fuel_amount = service(fuel, fuel_level, fuel_needs[index], fixed_fuel)?;
            let ve_amount = service(ve, ve_level, ve_needs[index], fixed_ve)?;
            // El respaldo monta ruedas nuevas salvo que esté fijado no hacerlo.
            let change_tyres = !fixed.keeps_tyres(index - 1);
            age = if change_tyres {
                0
            } else {
                age + stints[index - 1]
            };
            result.pit_stops.push(PitStop {
                lap: done,
                fuel_liters: amount(fuel_amount),
                ve_percent: amount(ve_amount),
                change_tyres,
                service_mode: input.pit_cost.service_mode.clone(),
            });
            service_seconds += pit_seconds(input, fuel_amount, ve_amount, change_tyres);
            fuel_level += fuel_amount;
            ve_level += ve_amount;
        }
        fuel_level -= count * fuel.per_lap;
        ve_level -= count * ve.per_lap;
        result.stints.push(length);
        done += length;
        let eval = &mut result.expected;
        let laps = f64::from(length);
        eval.green_seconds += laps * input.base_lap_seconds.value;
        eval.degradation_seconds +=
            input.degradation_per_lap_seconds.value * laps * (laps - 1.0) / 2.0;
        if age > 0 {
            // Ruedas sin cambiar: el desgaste sigue desde su edad.
            eval.degradation_seconds +=
                input.degradation_per_lap_seconds.value * laps * f64::from(age);
        }
    }
    let eval = &mut result.expected;
    eval.pit_seconds = service_seconds;
    eval.formation_seconds = input.formation.seconds.value;
    eval.total_seconds =
        eval.green_seconds + eval.degradation_seconds + eval.pit_seconds + eval.formation_seconds;
    Ok(result)
}
