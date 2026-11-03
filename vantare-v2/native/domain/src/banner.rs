//! Resolución común de la amarilla de sesión antes que la de sector.
//! El sector se conserva desde cero; cada presentación conserva su conversión.
use crate::{FlagKind, FlagScope, Snapshot};

pub(crate) enum Yellow {
    FullCourse,
    Sector(u8),
}

pub(crate) fn yellow(snapshot: &Snapshot) -> Option<Yellow> {
    let flags = snapshot.state.flags.current()?;
    if flags
        .iter()
        .any(|flag| flag.kind == FlagKind::Yellow && flag.scope == FlagScope::Session)
    {
        return Some(Yellow::FullCourse);
    }
    flags
        .iter()
        .find_map(|flag| match (&flag.kind, &flag.scope) {
            (FlagKind::Yellow, FlagScope::Sector(sector)) => Some(Yellow::Sector(*sector)),
            _ => None,
        })
}
