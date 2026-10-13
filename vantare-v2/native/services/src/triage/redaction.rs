//! Additional report redaction on top of the existing diagnostics cleaner.
pub(super) fn clean(text: &str, private_names: &[String]) -> String {
    let mut text = crate::diagnostics::clean_paths(&unc_paths(text));
    text = labeled_secrets(&text);
    for name in private_names.iter().filter(|n| !n.is_empty()) {
        for form in [name.clone(), name.to_lowercase(), name.to_uppercase()] {
            text = text.replace(&form, "<persona>");
        }
    }
    for variable in ["COMPUTERNAME", "USERNAME"] {
        if let Ok(name) = std::env::var(variable) {
            for form in [name.clone(), name.to_lowercase(), name.to_uppercase()] {
                if !form.is_empty() {
                    text = text.replace(&form, "<persona>");
                }
            }
        }
    }
    let mut out = String::new();
    for part in text.split_inclusive(char::is_whitespace) {
        let word = part.trim_end_matches(char::is_whitespace);
        let lower = word.to_ascii_lowercase();
        let private = lower.contains("sk_")
            || lower.contains("sk-")
            || lower.contains("vantare-key")
            || lower.contains("license_key=")
            || lower.contains("token=")
            || lower.contains("api_key=")
            || lower.contains("apikey=")
            || steam(word)
            || address(word);
        if private {
            out.push_str("<redactado>");
        } else if (lower.contains("https://") || lower.contains("http://")) && word.contains('?') {
            out.push_str(word.split('?').next().unwrap_or_default());
            out.push_str("?<redactado>");
        } else {
            out.push_str(word);
        }
        out.push_str(&part[word.len()..]);
    }
    phones(&out)
}
// Redact before diagnostics normalizes escaped separators. Unknown shares do
// not provide a trustworthy way to distinguish a user name from a directory.
fn unc_paths(text: &str) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i < text.len() {
        let before = i
            .checked_sub(1)
            .and_then(|at| text.as_bytes().get(at))
            .copied();
        if (text[i..].starts_with("\\\\") || text[i..].starts_with("//"))
            && !before.is_some_and(|b| matches!(b, b':' | b'\\' | b'/'))
        {
            let quote = before.filter(|b| matches!(b, b'"' | b'\''));
            let end = i + text[i..]
                .chars()
                .take_while(|c| {
                    !matches!(c, '\r' | '\n')
                        && quote.map_or(!c.is_whitespace() && !"\"'<>;,".contains(*c), |q| {
                            *c != char::from(q)
                        })
                })
                .map(char::len_utf8)
                .sum::<usize>();
            out.push_str("<ruta>");
            i = end;
        } else {
            let c = text[i..].chars().next().expect("boundary");
            out.push(c);
            i += c.len_utf8();
        }
    }
    out
}
fn labeled_secrets(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let labels = [
        "access_token",
        "refresh_token",
        "account_id",
        "accountid",
        "account-id",
        "hostname",
        "computername",
        "username",
        "gamertag",
        "token",
        "api_key",
        "apikey",
        "license_key",
        "license",
        "password",
        "authorization",
        "key",
    ];
    let mut out = String::new();
    let mut i = 0;
    while i < text.len() {
        let found = labels.iter().find(|label| {
            lower[i..].starts_with(**label)
                && (i == 0
                    || !text.as_bytes()[i - 1].is_ascii_alphanumeric()
                        && text.as_bytes()[i - 1] != b'_')
        });
        if let Some(label) = found {
            let mut start = i + label.len();
            while text
                .as_bytes()
                .get(start)
                .is_some_and(|b| b.is_ascii_whitespace() || matches!(b, b'\"' | b'\''))
            {
                start += 1;
            }
            if text
                .as_bytes()
                .get(start)
                .is_some_and(|b| matches!(b, b':' | b'='))
            {
                start += 1;
                while text
                    .as_bytes()
                    .get(start)
                    .is_some_and(u8::is_ascii_whitespace)
                {
                    start += 1;
                }
                let quote = text
                    .as_bytes()
                    .get(start)
                    .copied()
                    .filter(|b| matches!(b, b'\"' | b'\''));
                if quote.is_some() {
                    start += 1;
                }
                // An unquoted Authorization value includes the scheme AND credential.
                if *label == "authorization" && quote.is_none() {
                    for scheme in ["basic", "bearer"] {
                        let end = start + scheme.len();
                        if lower[start..].starts_with(scheme)
                            && text
                                .as_bytes()
                                .get(end)
                                .is_some_and(u8::is_ascii_whitespace)
                        {
                            start = end;
                            while text
                                .as_bytes()
                                .get(start)
                                .is_some_and(u8::is_ascii_whitespace)
                            {
                                start += 1;
                            }
                            break;
                        }
                    }
                }
                let end = start
                    + text[start..]
                        .chars()
                        .take_while(|c| {
                            quote.map_or(!c.is_whitespace() && !",;}".contains(*c), |q| {
                                *c != char::from(q)
                            })
                        })
                        .map(char::len_utf8)
                        .sum::<usize>();
                if end > start {
                    out.push_str("<redactado>");
                    i = end
                        + usize::from(
                            quote.is_some() && text.as_bytes().get(end) == quote.as_ref(),
                        );
                    continue;
                }
            }
        }
        let c = text[i..].chars().next().expect("boundary");
        out.push(c);
        i += c.len_utf8();
    }
    out
}
fn steam(word: &str) -> bool {
    word.as_bytes()
        .windows(17)
        .any(|w| w.starts_with(b"7656119") && w.iter().all(u8::is_ascii_digit))
}
fn address(word: &str) -> bool {
    for candidate in word.split(|c: char| !c.is_ascii_hexdigit() && !".:[]-".contains(c)) {
        let c = candidate.trim_matches(['[', ']', '.', ':', '-']);
        if c.parse::<std::net::IpAddr>().is_ok() {
            return true;
        }
        let parts: Vec<_> = c.split([':', '-']).collect();
        if parts.len() == 6
            && parts
                .iter()
                .all(|p| p.len() == 2 && p.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return true;
        }
        // An IPv6 value may have an attached label/port: examine valid suffixes.
        for (i, _) in candidate.char_indices() {
            if candidate[i..]
                .trim_matches(['[', ']'])
                .parse::<std::net::Ipv6Addr>()
                .is_ok()
            {
                return true;
            }
        }
    }
    false
}
fn phones(text: &str) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i < text.len() {
        let c = text[i..].chars().next().expect("character boundary");
        if c == '+' || c.is_ascii_digit() {
            let mut end = i;
            let mut count = 0;
            for (offset, c) in text[i..].char_indices() {
                if c.is_ascii_digit() {
                    count += 1;
                } else if !"+()- ".contains(c) {
                    break;
                }
                end = i + offset + c.len_utf8();
            }
            if (7..=17).contains(&count) {
                out.push_str("<redactado>");
                i = end;
                continue;
            }
        }
        out.push(c);
        i += c.len_utf8();
    }
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reports_redact_paths_identities_network_credentials_and_queries() {
        let raw = r"C:\Users\PrivateTester\log.txt email=user@example.invalid IP=192.168.12.7 IPv6=[2001:db8::7] MAC=aa:bb:cc:dd:ee:ff Steam=76561191234567890 key=sk_private_credential Bearer secret eyJfixture.payload.signature https://example.invalid/f?token=private +34 612 345 678 PC-PRIVATE KnownPlayer";
        let value = clean(raw, &["PC-PRIVATE".into(), "KnownPlayer".into()]);
        for private in [
            "PrivateTester",
            "user@example",
            "192.168.12.7",
            "2001:db8",
            "aa:bb:cc",
            "7656119",
            "sk_private",
            "secret",
            "eyJfixture",
            "token=private",
            "612 345",
            "PC-PRIVATE",
            "KnownPlayer",
        ] {
            assert!(
                !value.contains(private),
                "private value survived: {private}"
            );
        }
        assert_eq!(clean(&value, &[]), value);
    }
    #[test]
    fn redaction_preserves_unicode_and_useful_error_context() {
        let value = clean("ERROR sesión: módulo falló a 60 fps, CPU 20%", &[]);
        assert_eq!(value, "ERROR sesión: módulo falló a 60 fps, CPU 20%");
    }
    #[test]
    fn quoted_opaque_tokens_and_license_keys_are_not_copied_to_preview() {
        let raw = r#"{"access_token":"opaque-private","api_key":"short-secret","license_key":"VANTARE-PRIVATE"}"#;
        let text = clean(raw, &[]);
        for value in ["opaque-private", "short-secret", "VANTARE-PRIVATE"] {
            assert!(!text.contains(value));
        }
    }
}
