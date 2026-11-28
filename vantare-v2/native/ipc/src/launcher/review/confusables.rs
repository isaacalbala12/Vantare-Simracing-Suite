//! Letras de otros alfabetos que se parecen a las latinas (#2579).
//!
//! Solo se marcan dentro de una palabra que ya tiene una letra latina: una
//! palabra entera en cirílico o griego es un uso legítimo y no se toca. Límite
//! conocido: una palabra hecha solo con estos caracteres (p. ej. «арр» toda
//! cirílica) no se marca.

use super::invisible;

/// Carácter y la letra latina a la que se parece. Los anchos completos
/// (U+FF21–FF3A y U+FF41–FF5A) se tratan aparte, por rango.
const PAIRS: [(char, char); 55] = [
    ('\u{0430}', 'a'), ('\u{0435}', 'e'), ('\u{043E}', 'o'), ('\u{0440}', 'p'),
    ('\u{0441}', 'c'), ('\u{0445}', 'x'), ('\u{0443}', 'y'), ('\u{0456}', 'i'),
    ('\u{0458}', 'j'), ('\u{0455}', 's'), ('\u{0501}', 'd'), ('\u{051B}', 'q'),
    ('\u{051D}', 'w'), ('\u{04BB}', 'h'), ('\u{04CF}', 'l'),
    ('\u{0410}', 'A'), ('\u{0412}', 'B'), ('\u{0415}', 'E'), ('\u{041A}', 'K'),
    ('\u{041C}', 'M'), ('\u{041D}', 'H'), ('\u{041E}', 'O'), ('\u{0420}', 'P'),
    ('\u{0421}', 'C'), ('\u{0422}', 'T'), ('\u{0425}', 'X'), ('\u{0406}', 'I'),
    ('\u{0408}', 'J'), ('\u{0405}', 'S'), ('\u{04AE}', 'Y'),
    ('\u{03BF}', 'o'), ('\u{03B1}', 'a'), ('\u{03BD}', 'v'), ('\u{03C1}', 'p'),
    ('\u{03C5}', 'u'), ('\u{03B9}', 'i'), ('\u{03BA}', 'k'), ('\u{03C7}', 'x'),
    ('\u{03F2}', 'c'),
    ('\u{0391}', 'A'), ('\u{0392}', 'B'), ('\u{0395}', 'E'), ('\u{0396}', 'Z'),
    ('\u{0397}', 'H'), ('\u{0399}', 'I'), ('\u{039A}', 'K'), ('\u{039C}', 'M'),
    ('\u{039D}', 'N'), ('\u{039F}', 'O'), ('\u{03A1}', 'P'), ('\u{03A4}', 'T'),
    ('\u{03A5}', 'Y'), ('\u{03A7}', 'X'), ('\u{03F9}', 'C'),
    ('\u{0131}', 'i'),
];

fn is_confusable(c: char) -> bool {
    PAIRS.iter().any(|&(other, _)| other == c)
        || matches!(c, '\u{FF21}'..='\u{FF3A}' | '\u{FF41}'..='\u{FF5A}')
}

fn is_latin(c: char) -> bool {
    c.is_ascii_alphabetic()
        || (('\u{C0}'..='\u{24F}').contains(&c) && c.is_alphabetic() && !is_confusable(c))
}

/// Un carácter invisible que no es espacio pertenece a la palabra: partirla con
/// una marca de anchura cero no debe esconder la mezcla.
fn in_word(c: char) -> bool {
    c.is_alphanumeric() || (invisible(c) && !c.is_whitespace())
}

/// Por carácter: `true` si es un confundible dentro de una palabra mixta.
pub(super) fn marked(text: &str) -> Vec<bool> {
    let chars: Vec<char> = text.chars().collect();
    let mut marks = vec![false; chars.len()];
    let mut start = 0;
    while start < chars.len() {
        if !in_word(chars[start]) {
            start += 1;
            continue;
        }
        let end = chars[start..]
            .iter()
            .position(|&c| !in_word(c))
            .map_or(chars.len(), |n| start + n);
        if chars[start..end].iter().any(|&c| is_latin(c)) {
            for i in start..end {
                marks[i] = is_confusable(chars[i]);
            }
        }
        start = end;
    }
    marks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_list_is_well_formed_and_not_silently_shortened() {
        assert_eq!(PAIRS.len(), 55);
        for (i, &(c, latin)) in PAIRS.iter().enumerate() {
            assert!(!c.is_ascii() && latin.is_ascii_alphabetic(), "U+{:04X}", c as u32);
            assert!(!PAIRS[..i].iter().any(|&(o, _)| o == c), "U+{:04X}", c as u32);
        }
    }

    #[test]
    fn every_pair_is_marked_next_to_a_latin_letter() {
        for &(c, latin) in &PAIRS {
            let word = format!("x{c}{latin}");
            assert_eq!(marked(&word), [false, true, false], "U+{:04X}", c as u32);
        }
        assert_eq!(marked("x\u{FF42}\u{FF3A}"), [false, true, true]);
    }
}
