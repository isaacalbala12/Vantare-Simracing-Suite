pub const TEXT_MAX: usize = 300;
pub const NAME_MAX: usize = 128;
pub const PHOTO_BASE64_MAX: usize = 32 * 1024;
pub fn clean(value: &str) -> String {
    let value: String = value
        .chars()
        .filter(|c| !c.is_control())
        .take(TEXT_MAX)
        .collect();
    if value.contains("://") {
        "No se pudo completar el acceso.".into()
    } else {
        value
    }
}
pub fn name(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_control())
        .take(NAME_MAX)
        .collect::<String>()
        .replace("://", " ")
}
pub fn photo(value: Option<&str>) -> Option<String> {
    let value = value?;
    if value.len() > PHOTO_BASE64_MAX || value.is_empty() || value.len() % 4 != 0 {
        return None;
    }
    let mut bytes = Vec::with_capacity(value.len() / 4 * 3);
    let chunks = value.as_bytes().chunks_exact(4);
    let count = value.len() / 4;
    for (index, chunk) in chunks.enumerate() {
        let mut bits = 0u32;
        let mut padding = 0;
        for (position, &byte) in chunk.iter().enumerate() {
            let digit = match byte {
                b'A'..=b'Z' => byte - b'A',
                b'a'..=b'z' => byte - b'a' + 26,
                b'0'..=b'9' => byte - b'0' + 52,
                b'+' => 62,
                b'/' => 63,
                b'=' if index + 1 == count && position >= 2 => {
                    padding += 1;
                    0
                }
                _ => return None,
            };
            if padding > 0 && byte != b'=' {
                return None;
            }
            bits = (bits << 6) | u32::from(digit);
        }
        if padding == 1 && bits & 255 != 0 || padding == 2 && bits & 65535 != 0 {
            return None;
        }
        bytes.push(u8::try_from((bits >> 16) & 255).ok()?);
        if padding < 2 {
            bytes.push(u8::try_from((bits >> 8) & 255).ok()?);
        }
        if padding == 0 {
            bytes.push(u8::try_from(bits & 255).ok()?);
        }
    }
    bytes
        .starts_with(&[255, 216, 255])
        .then(|| format!("data:image/jpeg;base64,{value}"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn service_text_never_echoes_urls_controls_or_unbounded_prose() {
        assert_eq!(
            clean("failed https://private.invalid/?code=secret"),
            "No se pudo completar el acceso."
        );
        assert_eq!(clean("a\n\0b"), "ab");
        assert_eq!(clean(&"x".repeat(301)).len(), 300);
    }
    #[test]
    fn only_bounded_canonical_jpeg_base64_reaches_the_view() {
        assert!(photo(Some("/9j/AA==")).is_some());
        for value in ["iVBORw==", "/9j/AB==", "/9j/A=AA", "/9j/!!!!", "/9j/é"] {
            assert!(photo(Some(value)).is_none());
        }
        assert!(photo(Some(&"A".repeat(PHOTO_BASE64_MAX + 4))).is_none());
    }
}
