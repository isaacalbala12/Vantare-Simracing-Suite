//! Internal quality semantics matching Go's canonical Field contract.
//! A missing field has no value; zero and false remain explicit observations.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Provenance {
    Observed = 1,
    Derived = 2,
    Estimated = 3,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Freshness {
    Fresh = 1,
    Stale = 2,
    Invalid = 3,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Field<T> {
    Missing,
    Present {
        value: T,
        provenance: Provenance,
        freshness: Freshness,
    },
}

impl<T> Field<T> {
    pub fn observed(value: T) -> Self {
        Self::Present {
            value,
            provenance: Provenance::Observed,
            freshness: Freshness::Fresh,
        }
    }

    pub fn invalid_observed(value: T) -> Self {
        Self::Present {
            value,
            provenance: Provenance::Observed,
            freshness: Freshness::Invalid,
        }
    }

    pub fn value(&self) -> Option<&T> {
        match self {
            Self::Missing => None,
            Self::Present { value, .. } => Some(value),
        }
    }

    pub fn quality(&self) -> (Option<Provenance>, Option<Freshness>) {
        match self {
            Self::Missing => (None, None),
            Self::Present {
                provenance,
                freshness,
                ..
            } => (Some(*provenance), Some(*freshness)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_zero_and_false_are_distinct() {
        let missing: Field<i32> = Field::Missing;
        assert_eq!(missing.value(), None);
        assert_eq!(missing.quality(), (None, None));
        let zero = Field::observed(0_i32);
        assert_eq!(zero.value(), Some(&0));
        assert_eq!(
            zero.quality(),
            (Some(Provenance::Observed), Some(Freshness::Fresh))
        );
        assert_eq!(Field::observed(false).value(), Some(&false));
    }

    #[test]
    fn invalid_keeps_presence_and_observed_provenance() {
        let invalid = Field::invalid_observed(0_i32);
        assert_eq!(invalid.value(), Some(&0));
        assert_eq!(
            invalid.quality(),
            (Some(Provenance::Observed), Some(Freshness::Invalid))
        );
    }
}
