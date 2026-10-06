//! Saneado del texto que viene del simulador y acaba pintado.
//!
//! Los nombres de piloto, equipo y circuito llegan del mapeo del simulador, y en
//! multijugador los elige otro usuario. Sin filtro, un nombre con U+202E
//! (override bidireccional) reordena visualmente lo que se pinta a su alrededor,
//! y uno con caracteres de anchura cero o controles C0/C1 oculta o falsea el
//! texto de los standings.
//!
//! No es XSS: el HTML se escapa aparte. El problema es que **lo que se ve no es
//! lo que hay**, y en una retransmision eso es suplantacion.

/// Quita los caracteres que permiten suplantacion visual o rompen la linea, y
/// recorta los extremos.
///
/// Los controles se sustituyen por espacio en vez de eliminarse: un nombre con
/// un tabulador no debe quedar pegado a la palabra siguiente. Las marcas
/// invisibles (bidireccionales, de anchura cero y el BOM) se eliminan, porque
/// ocupan sitio sin verse.
/// `true` si el caracter es una marca **invisible**: ocupa sitio sin verse, que
/// es justo lo que permite que lo que se lee no sea lo que hay.
///
/// Esta es la unica definicion del conjunto. Cualquier otro sitio que necesite
/// filtrarlas (por ejemplo un campo de texto multilinea, que si debe conservar
/// los saltos de linea) la reutiliza en vez de copiar la lista.
pub fn is_invisible(ch: char) -> bool {
    matches!(
        ch,
        // Overrides, embeddings e isolates bidireccionales.
        '\u{202a}'..='\u{202e}'
        // Anchura cero y marcas direccionales.
        | '\u{200b}'..='\u{200f}'
        | '\u{2066}'..='\u{2069}'
        | '\u{feff}'
    )
}

pub fn sanitize_display(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            // Controles C0 y C1 (incluido DEL) y separadores de linea y de
            // parrafo: se sustituyen por espacio para que un nombre con un
            // tabulador no quede pegado a la palabra siguiente.
            '\u{0}'..='\u{1f}' | '\u{7f}'..='\u{9f}' | '\u{2028}' | '\u{2029}' => out.push(' '),
            // Las marcas invisibles se eliminan.
            _ if is_invisible(ch) => {}
            _ => out.push(ch),
        }
    }
    out.trim().to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinary_names_pass_through_unchanged() {
        for name in [
            "Max Verstappen",
            "José María López",
            "Kimi Räikkönen",
            "Team WRT",
            "Circuit de Spa-Francorchamps",
        ] {
            assert_eq!(sanitize_display(name), name);
        }
    }

    /// El override bidireccional es el vector clasico: invierte lo que se ve a
    /// su alrededor sin cambiar lo que hay.
    #[test]
    fn bidirectional_marks_are_removed() {
        assert_eq!(sanitize_display("a\u{202e}bc"), "abc");
        assert_eq!(sanitize_display("a\u{202a}b\u{202c}c"), "abc");
        assert_eq!(sanitize_display("a\u{2066}b\u{2069}c"), "abc");
        assert_eq!(sanitize_display("\u{200f}Nombre"), "Nombre");
    }

    #[test]
    fn zero_width_characters_are_removed() {
        assert_eq!(sanitize_display("No\u{200b}mbre"), "Nombre");
        assert_eq!(sanitize_display("\u{feff}Nombre"), "Nombre");
    }

    /// Los controles se sustituyen por espacio y luego se recortan, para que un
    /// nombre con un tabulador no quede pegado a la palabra siguiente.
    #[test]
    fn controls_become_spaces_and_the_edges_are_trimmed() {
        assert_eq!(sanitize_display("Juan\tPerez"), "Juan Perez");
        assert_eq!(sanitize_display("Linea\u{7f}Uno"), "Linea Uno");
        assert_eq!(sanitize_display("\u{0}Nombre\u{1f}"), "Nombre");
        assert_eq!(sanitize_display("a\nb"), "a b");
        assert_eq!(sanitize_display("a\u{2028}b"), "a b");
    }

    #[test]
    fn empty_and_whitespace_only_become_empty() {
        assert!(sanitize_display("").is_empty());
        assert!(sanitize_display("   ").is_empty());
        assert!(sanitize_display("\u{202e}").is_empty());
    }

    /// El saneado nunca alarga el texto mas alla de un caracter por entrada.
    #[test]
    fn result_is_never_longer_than_the_input() {
        let raw = "a\u{202e}b\u{200b}c\td";
        assert!(sanitize_display(raw).chars().count() <= raw.chars().count());
    }
}
