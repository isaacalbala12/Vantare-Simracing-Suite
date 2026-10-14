//! Limpieza local, sin red ni dependencias adicionales; también protege colas antiguas.

pub(super) fn clean(text: &str) -> String {
    let profiles: Vec<_> = ["USERPROFILE", "HOME"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    emails(&tokens(&profiles_removed(text, &profiles)))
}

fn profiles_removed(text: &str, profiles: &[String]) -> String {
    let text = text.replace("\\\\", "\\");
    // ASCII case folding y separadores de un byte conservan los índices UTF-8.
    let lower = text.replace('\\', "/").to_ascii_lowercase();
    let roots: Vec<_> = profiles
        .iter()
        .map(|root| {
            root.replace("\\\\", "\\")
                .replace('\\', "/")
                .trim_end_matches('/')
                .to_ascii_lowercase()
        })
        .filter(|root| !root.is_empty())
        .collect();
    let mut result = String::new();
    let mut i = 0;
    while let Some(c) = text[i..].chars().next() {
        let tail = &lower[i..];
        let real = roots.iter().find_map(|root| {
            let mut chars = tail.char_indices();
            let mut end = i;
            for expected in root.chars() {
                let (offset, actual) = chars.next()?;
                if !actual.to_lowercase().eq(expected.to_lowercase()) {
                    return None;
                }
                end = i + offset + actual.len_utf8();
            }
            lower
                .as_bytes()
                .get(end)
                .is_none_or(|b| b.is_ascii_whitespace() || b"/\"'),;:]".contains(b))
                .then_some(end)
        });
        let generic =
            if tail.as_bytes()[0].is_ascii_alphabetic() && tail[1..].starts_with(":/users/") {
                Some(i + 9)
            } else if tail.starts_with("/home/") {
                Some(i + 6)
            } else if tail.starts_with("/users/") {
                Some(i + 7)
            } else {
                None
            };
        let end = real.or_else(|| {
            generic.and_then(|name| {
                let end = text[name..]
                    .find(['\\', '/', '\n', '\r'])
                    .map_or(text.len(), |offset| name + offset);
                (end > name).then_some(end)
            })
        });
        if let Some(end) = end {
            result.push_str("<usuario>");
            i = end;
        } else {
            // i siempre procede de un límite de carácter, incluido el final de un perfil.
            result.push(c);
            i += c.len_utf8();
        }
    }
    result
}

fn tokens(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let mut result = String::new();
    let mut i = 0;
    while let Some(c) = text[i..].chars().next() {
        let tail = &lower[i..];
        let jwt = tail.starts_with("eyj");
        let bearer = tail.starts_with("bearer")
            && tail
                .as_bytes()
                .get(6)
                .is_some_and(|b| matches!(b, b' ' | b'\t'));
        let mut start = if bearer {
            i + 6
                + text[i + 6..]
                    .bytes()
                    .take_while(|b| matches!(b, b' ' | b'\t'))
                    .count()
        } else {
            i
        };
        let quote = if bearer {
            text.as_bytes()
                .get(start)
                .copied()
                .filter(|b| matches!(b, b'\"' | b'\''))
        } else {
            None
        };
        if quote.is_some() {
            start += 1;
        }
        let mut end = if jwt || bearer {
            start
                + text[start..]
                    .chars()
                    .take_while(|c| {
                        if jwt {
                            c.is_ascii_alphanumeric() || "._-=+/".contains(*c)
                        } else {
                            !c.is_whitespace() && !"\"'()[]{}<>,;".contains(*c)
                        }
                    })
                    .map(char::len_utf8)
                    .sum::<usize>()
        } else {
            start
        };
        if (jwt || bearer) && end > start {
            if quote.is_some() && text.as_bytes().get(end) == quote.as_ref() {
                end += 1;
            }
            result.push_str("<redactado>");
            i = end;
        } else {
            result.push(c);
            i += c.len_utf8();
        }
    }
    result
}

fn emails(text: &str) -> String {
    let mut result = String::new();
    let mut from = 0;
    for (at, _) in text.match_indices('@') {
        if at < from {
            continue;
        }
        let start = text[..at]
            .char_indices()
            .rev()
            .take_while(|(_, c)| c.is_alphanumeric() || ".!#$%&'*+-/=?^_`{|}~".contains(*c))
            .last()
            .map_or(at, |(offset, _)| offset)
            .max(from);
        let end = text[at + 1..]
            .char_indices()
            .take_while(|(_, c)| c.is_alphanumeric() || ".-".contains(*c))
            .last()
            .map_or(at + 1, |(offset, c)| at + 1 + offset + c.len_utf8());
        if start < at && text[at + 1..end].chars().any(char::is_alphanumeric) {
            result.push_str(&text[from..start]);
            result.push_str("<redactado>");
            from = end;
        }
    }
    result.push_str(&text[from..]);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_profiles_outside_standard_locations_match_case_and_separators() {
        let profiles = vec![
            r"X:\Private\Ada Name".into(),
            "/Volumes/Data/SomePerson".into(),
            r"\\NAS\Profiles\Müller".into(),
            "/p".into(),
        ];
        assert_eq!(
            profiles_removed(
                "X:/PRIVATE/ADA NAME/a.rs /volumes/data/someperson/b.rs",
                &profiles
            ),
            "<usuario>/a.rs <usuario>/b.rs"
        );
        assert_eq!(
            profiles_removed(r"X:\Private\Ada Names\a.rs", &profiles),
            r"X:\Private\Ada Names\a.rs"
        );
        assert_eq!(
            profiles_removed(r"\\nas\profiles\MÜLLER\a.rs /p/b.rs", &profiles),
            r"<usuario>\a.rs <usuario>/b.rs"
        );
    }

    #[test]
    fn redaction_preserves_utf8_and_is_idempotent() {
        let text = "falló: /HOME/María/a.rs /Users/O'Neil/b.rs él+prueba@example.test eyJfixture.payload.signature bEaReR fixture-secret";
        let clean = clean(text);
        assert_eq!(
            clean,
            "falló: <usuario>/a.rs <usuario>/b.rs <redactado> <redactado> <redactado>"
        );
        assert_eq!(super::clean(&clean), clean);
    }
}
