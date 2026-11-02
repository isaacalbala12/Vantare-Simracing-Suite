//! One numeric version contract shared by metadata, comparison and display.

pub fn hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn channel(value: &str) -> bool {
    matches!(value, "nightly" | "testers" | "master" | "beta")
}

/// Closed package version: three u16 components, without leading zeroes.
pub fn version(value: &str) -> Result<[u16; 3], String> {
    let parts = value
        .split('.')
        .map(|part| {
            if part.is_empty()
                || !part.bytes().all(|byte| byte.is_ascii_digit())
                || (part.len() > 1 && part.starts_with('0'))
            {
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
