//! Deterministic Go p95 policy: coarsen service steps by powers of two.
use super::{Discretization, Input};

pub(super) fn effective(input: &Input) -> (Input, Discretization) {
    let requested = Discretization {
        fuel_liters: if input.discretization.fuel_liters == 0.0 {
            1.0
        } else {
            input.discretization.fuel_liters
        },
        ve_percent: if input.discretization.ve_percent == 0.0 {
            1.0
        } else {
            input.discretization.ve_percent
        },
    };
    let mut changed = input.clone();
    #[allow(clippy::cast_precision_loss)] // Clamped to the exact 4..=200 range.
    let levels = input.budget.p95_millis.clamp(4, 200) as f64;
    let coarsen = |capacity: f64, mut step: f64| {
        if capacity <= 0.0 || step <= 0.0 || !capacity.is_finite() || !step.is_finite() {
            return step;
        }
        while (capacity / step).floor() + 1.0 > levels {
            step *= 2.0;
            if step >= capacity {
                return capacity;
            }
        }
        step
    };
    changed.discretization = Discretization {
        fuel_liters: coarsen(input.fuel_capacity_liters.value, requested.fuel_liters),
        ve_percent: coarsen(input.ve_capacity_percent.value, requested.ve_percent),
    };
    (changed, requested)
}
