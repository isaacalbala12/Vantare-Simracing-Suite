//! Atajos locales exactos: `AltGr` y combinaciones extendidas no lanzan acciones.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Shortcut {
    Launch,
    Search,
    Left,
    Right,
}

pub(super) fn resolve(key: &gpui::Keystroke) -> Option<Shortcut> {
    if !key.modifiers.control
        || key.modifiers.platform
        || key.modifiers.shift
        || key.modifiers.function
    {
        return None;
    }
    match (key.key.to_ascii_lowercase().as_str(), key.modifiers.alt) {
        ("l", false) => Some(Shortcut::Launch),
        ("k", false) => Some(Shortcut::Search),
        ("b", false) => Some(Shortcut::Left),
        ("b", true) => Some(Shortcut::Right),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hub_shortcuts_match_exact_modifiers_and_case() {
        for (letter, alt, expected) in [
            ("L", false, Shortcut::Launch),
            ("k", false, Shortcut::Search),
            ("B", false, Shortcut::Left),
            ("b", true, Shortcut::Right),
        ] {
            let mut key = gpui::Keystroke {
                key: letter.into(),
                key_char: None,
                modifiers: gpui::Modifiers {
                    control: true,
                    alt,
                    ..Default::default()
                },
            };
            assert_eq!(resolve(&key), Some(expected));
            key.modifiers.shift = true;
            assert_eq!(resolve(&key), None);
            key.modifiers.shift = false;
            key.modifiers.control = false;
            assert_eq!(resolve(&key), None);
        }
    }
}
