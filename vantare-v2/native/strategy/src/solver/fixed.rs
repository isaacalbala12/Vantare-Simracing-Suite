//! Cantidades fijadas a mano por parada (#2690).
//!
//! Lo fijado restringe la búsqueda y el plan de respaldo: en una parada con una
//! cantidad fijada solo se prueba esa cantidad. La posición en la lista es el
//! número de parada (0 = primera). Una lista vacía, o con todo en `None`, deja
//! el cálculo exactamente igual que sin lista.
use super::{Deserialize, Input, PitStop, Resource, Serialize, Value, budget, units};

/// Lo que el usuario fija en una parada. `None`: lo decide el cálculo.
#[derive(Clone, Copy, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FixedStop {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fuel_liters: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ve_percent: Option<f64>,
}

impl FixedStop {
    /// Si una parada de un plan lleva exactamente lo fijado, comparado en las
    /// unidades enteras del cálculo (millonésimas), como al aceptarlo.
    pub(crate) fn kept_by(&self, stop: &PitStop) -> bool {
        let same = |fixed: Option<f64>, planned: f64| {
            fixed.is_none_or(|fixed| units(fixed).ok() == units(planned).ok())
        };
        same(self.fuel_liters, stop.fuel_liters) && same(self.ve_percent, stop.ve_percent)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FixedResource {
    Fuel,
    VirtualEnergy,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FixedStopProblem {
    /// No es un número, es negativa o supera la capacidad.
    OutOfRange,
    /// No es múltiplo del paso efectivo de la rejilla.
    OffGrid,
}

/// Una cantidad fijada que el cálculo no puede aceptar, con su parada.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InvalidFixedStop {
    pub stop: usize,
    pub resource: FixedResource,
    pub problem: FixedStopProblem,
}

impl std::fmt::Display for InvalidFixedStop {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let field = match self.resource {
            FixedResource::Fuel => "fuelLiters",
            FixedResource::VirtualEnergy => "vePercent",
        };
        let problem = match self.problem {
            FixedStopProblem::OutOfRange => "fuera de rango",
            FixedStopProblem::OffGrid => "no es múltiplo del paso",
        };
        write!(
            f,
            "invalid_input: fixedStops[{}].{field} {problem}",
            self.stop
        )
    }
}

/// Lo fijado, ya validado y en las unidades enteras del cálculo (millonésimas).
/// Las paradas automáticas del final no se guardan: «sin nada fijado» es vacío.
#[derive(Clone, Debug, Default)]
pub(super) struct Fixed(Vec<(Option<i64>, Option<i64>)>);

impl Fixed {
    pub fn new(
        stops: &[FixedStop],
        fuel: Resource,
        ve: Resource,
    ) -> Result<Self, InvalidFixedStop> {
        let mut amounts = Vec::with_capacity(stops.len());
        for (stop, fixed) in stops.iter().enumerate() {
            let invalid = |resource| {
                move |problem| InvalidFixedStop {
                    stop,
                    resource,
                    problem,
                }
            };
            amounts.push((
                amount(fixed.fuel_liters, fuel).map_err(invalid(FixedResource::Fuel))?,
                amount(fixed.ve_percent, ve).map_err(invalid(FixedResource::VirtualEnergy))?,
            ));
        }
        while amounts.last() == Some(&(None, None)) {
            amounts.pop();
        }
        Ok(Self(amounts))
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Combustible y energía fijados en la parada `stop`, en unidades del cálculo.
    pub fn at(&self, stop: usize) -> (Option<i64>, Option<i64>) {
        self.0.get(stop).copied().unwrap_or_default()
    }

    /// Paradas que un plan necesita para respetar lo fijado: hasta la última fijada.
    pub fn required_stops(&self) -> usize {
        self.0.len()
    }

    /// Paradas con algo fijado, de la primera a la última.
    pub fn stops(&self) -> impl Iterator<Item = usize> + '_ {
        self.0
            .iter()
            .enumerate()
            .filter(|(_, fixed)| **fixed != (None, None))
            .map(|(stop, _)| stop)
    }

    /// Lo fijado hasta la parada `stop` incluida; el resto queda automático.
    pub fn up_to(&self, stop: usize) -> Self {
        Self(self.0.iter().take(stop + 1).copied().collect())
    }
}

/// Tolerancia de «múltiplo del paso»: el cálculo trabaja en millonésimas de
/// litro o de punto porcentual. La cantidad se redondea a esa unidad (así
/// `0.1 + 0.2` vale 0,3) y después se exige un múltiplo exacto del paso.
fn amount(value: Option<f64>, resource: Resource) -> Result<Option<i64>, FixedStopProblem> {
    let Some(value) = value else {
        return Ok(None);
    };
    let amount = units(value).map_err(|_| FixedStopProblem::OutOfRange)?;
    if amount > resource.capacity {
        return Err(FixedStopProblem::OutOfRange);
    }
    if amount % resource.step != 0 {
        return Err(FixedStopProblem::OffGrid);
    }
    Ok(Some(amount))
}

/// Dice si el cálculo acepta lo fijado para esta entrada, con la misma regla
/// que la búsqueda y el respaldo. `Ok(None)`: todo vale. `Err`: la entrada en sí
/// no es válida.
pub fn check_fixed_stops(
    input: &Input,
    fixed: &[FixedStop],
) -> Result<Option<InvalidFixedStop>, String> {
    let (effective, _) = budget::effective(input);
    let resource = |capacity, per_lap, step| {
        Resource::new(capacity, per_lap, step, &Value::Null, input.race_laps)
    };
    let fuel = resource(
        effective.fuel_capacity_liters.value,
        effective.fuel_per_lap_liters.value,
        effective.discretization.fuel_liters,
    )?;
    let ve = resource(
        effective.ve_capacity_percent.value,
        effective.ve_per_lap_percent.value,
        effective.discretization.ve_percent,
    )?;
    Ok(Fixed::new(fixed, fuel, ve).err())
}
