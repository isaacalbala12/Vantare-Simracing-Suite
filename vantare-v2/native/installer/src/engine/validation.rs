//! Existing version contracts, kept distinct until their consumers migrate.

pub fn hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn channel(value: &str) -> bool {
    matches!(value, "nightly" | "testers" | "master" | "beta")
}

/// Packaging syntax. Hub adds its existing 100-byte presentation bound.
pub fn package_version(value: &str) -> bool {
    let (numbers, suffix) = value
        .split_once('-')
        .map_or((value, None), |(a, b)| (a, Some(b)));
    let parts: Vec<_> = numbers.split('.').collect();
    (3..=4).contains(&parts.len())
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
        && suffix.is_none_or(|suffix| {
            !suffix.is_empty()
                && suffix.len() <= 64
                && suffix
                    .as_bytes()
                    .first()
                    .is_some_and(u8::is_ascii_alphanumeric)
                && suffix
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
        })
}

pub fn hub_version(value: &str) -> bool {
    value.len() <= 100 && package_version(value)
}

/// Setup's existing numeric comparison contract; not a semver ordering.
pub fn setup_version(value: &str) -> Result<[u16; 3], String> {
    let parts = value
        .split('.')
        .map(|part| {
            if part.is_empty() || (part.len() > 1 && part.starts_with('0')) {
                return Err("Versión inválida".to_owned());
            }
            part.parse::<u16>()
                .map_err(|_| "Versión inválida".to_owned())
        })
        .collect::<Result<Vec<_>, _>>()?;
    parts
        .try_into()
        .map_err(|_| "Versión debe tener tres componentes".into())
}
