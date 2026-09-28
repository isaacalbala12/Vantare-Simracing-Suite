//! Product-neutral derivations from committed observed fields.

use crate::quality::{Field, Freshness, Provenance};

/// Go's session.remaining v1 contract. Source time is nanoseconds; end and
/// result are seconds. Inputs must have matching usable observed quality.
pub fn session_remaining(current_ns: &Field<i64>, end_seconds: &Field<f64>) -> Field<f64> {
    let invalid = || Field::Present {
        value: 0.0,
        provenance: Provenance::Derived,
        freshness: Freshness::Invalid,
    };
    if matches!(
        current_ns,
        Field::Present {
            freshness: Freshness::Invalid,
            ..
        }
    ) || matches!(
        end_seconds,
        Field::Present {
            freshness: Freshness::Invalid,
            ..
        }
    ) {
        return invalid();
    }
    if matches!(
        current_ns,
        Field::Present {
            provenance: Provenance::Derived | Provenance::Estimated,
            ..
        }
    ) || matches!(
        end_seconds,
        Field::Present {
            provenance: Provenance::Derived | Provenance::Estimated,
            ..
        }
    ) {
        return invalid();
    }
    let (current, current_quality) = match current_ns {
        Field::Present {
            value,
            provenance: Provenance::Observed,
            freshness,
        } => (*value, *freshness),
        Field::Present { .. } => return invalid(),
        Field::Missing => return Field::Missing,
    };
    let (end, end_quality) = match end_seconds {
        Field::Present {
            value,
            provenance: Provenance::Observed,
            freshness,
        } => (*value, *freshness),
        Field::Present { .. } => return invalid(),
        Field::Missing => return Field::Missing,
    };
    if current_quality != end_quality {
        return Field::Missing;
    }
    let remaining = end - current as f64 / 1_000_000_000.0;
    if current < 0 || !end.is_finite() || remaining < 0.0 || !remaining.is_finite() {
        return invalid();
    }
    Field::Present {
        value: remaining,
        provenance: Provenance::Derived,
        freshness: current_quality,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn observed<T>(value: T, freshness: Freshness) -> Field<T> {
        Field::Present {
            value,
            provenance: Provenance::Observed,
            freshness,
        }
    }

    #[test]
    fn matches_go_remaining_quality_and_boundary_matrix() {
        let fresh = Freshness::Fresh;
        let stale = Freshness::Stale;
        assert_eq!(
            session_remaining(&observed(25_000_000_000, fresh), &observed(100.0, fresh)),
            Field::Present {
                value: 75.0,
                provenance: Provenance::Derived,
                freshness: fresh
            }
        );
        assert_eq!(
            session_remaining(&observed(100_000_000_000, fresh), &observed(100.0, fresh)).value(),
            Some(&0.0)
        );
        assert!(matches!(
            session_remaining(&observed(25_000_000_000, stale), &observed(100.0, fresh)),
            Field::Missing
        ));
        assert_eq!(
            session_remaining(&observed(25_000_000_000, stale), &observed(100.0, stale)).quality(),
            (Some(Provenance::Derived), Some(stale))
        );
        assert!(matches!(
            session_remaining(&observed(25_000_000_000, fresh), &Field::Missing),
            Field::Missing
        ));
        assert_eq!(
            session_remaining(&observed(101_000_000_000, fresh), &observed(100.0, fresh)).quality(),
            (Some(Provenance::Derived), Some(Freshness::Invalid))
        );
        assert_eq!(
            session_remaining(
                &observed(25_000_000_000, fresh),
                &observed(f64::INFINITY, fresh)
            )
            .quality(),
            (Some(Provenance::Derived), Some(Freshness::Invalid))
        );
    }

    #[test]
    fn derived_and_invalid_inputs_do_not_become_fresh() {
        let derived_time = Field::Present {
            value: 25_000_000_000_i64,
            provenance: Provenance::Derived,
            freshness: Freshness::Fresh,
        };
        assert_eq!(
            session_remaining(&derived_time, &Field::observed(100.0)).quality(),
            (Some(Provenance::Derived), Some(Freshness::Invalid))
        );
        assert_eq!(
            session_remaining(&Field::invalid_observed(25_i64), &Field::observed(100.0)).quality(),
            (Some(Provenance::Derived), Some(Freshness::Invalid))
        );
        assert_eq!(
            session_remaining(&observed(-1_i64, Freshness::Fresh), &Field::observed(100.0))
                .quality(),
            (Some(Provenance::Derived), Some(Freshness::Invalid))
        );
    }
}
