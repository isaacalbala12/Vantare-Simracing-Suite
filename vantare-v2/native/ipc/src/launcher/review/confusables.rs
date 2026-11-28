//! Letras de otros alfabetos que se parecen a las latinas (#2579).
//!
//! El texto se parte en segmentos (entre `\ / = , ; "` y espacios) y cada
//! segmento en palabras (letras, cifras y acentos). Se muestran como
//! `[U+XXXX]`:
//! - (A) todo carácter no ASCII de la extensión del segmento («steam.ехе»):
//!   las extensiones son latinas por convención;
//! - (B) las letras de la lista dentro de una palabra con alguna latina
//!   («Stеam» con «е» cirílica);
//! - (C) las de una palabra hecha solo de letras de la lista («АРР») cuando el
//!   resto del segmento, sin la extensión, es latino («Game_АРР»).
//!
//! No se toca un nombre entero en su alfabeto: «Игра», «хор.exe», «ΟΧΙ.bat».
//!
//! Sin tablas Unicode completas: NFC y NFD dan el mismo veredicto porque las
//! letras precompuestas de la lista ([`COMPOSED`]) se pliegan a su letra base y
//! los acentos combinables ([`combining`]) cuentan como parte de la palabra.

use super::invisible;

/// Carácter y la letra latina a la que se parece.
#[rustfmt::skip]
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

/// Letra precompuesta (NFC) y su letra base: «ё» es «е» + «◌̈». La base está
/// en [`PAIRS`] salvo «У», que por sí sola no se parece a una latina.
#[rustfmt::skip]
const COMPOSED: [(char, char); 34] = [
    ('\u{0400}', '\u{0415}'), ('\u{0401}', '\u{0415}'), ('\u{0450}', '\u{0435}'),
    ('\u{0451}', '\u{0435}'), ('\u{04D6}', '\u{0415}'), ('\u{04D7}', '\u{0435}'),
    ('\u{0407}', '\u{0406}'), ('\u{0457}', '\u{0456}'), ('\u{040C}', '\u{041A}'),
    ('\u{04D0}', '\u{0410}'), ('\u{04D1}', '\u{0430}'), ('\u{04D2}', '\u{0410}'),
    ('\u{04D3}', '\u{0430}'), ('\u{04E6}', '\u{041E}'), ('\u{04E7}', '\u{043E}'),
    ('\u{04EE}', '\u{0423}'), ('\u{04EF}', '\u{0443}'), ('\u{04F0}', '\u{0423}'),
    ('\u{04F1}', '\u{0443}'),
    ('\u{0386}', '\u{0391}'), ('\u{0388}', '\u{0395}'), ('\u{0389}', '\u{0397}'),
    ('\u{038A}', '\u{0399}'), ('\u{038C}', '\u{039F}'), ('\u{038E}', '\u{03A5}'),
    ('\u{03AA}', '\u{0399}'), ('\u{03AB}', '\u{03A5}'), ('\u{03AC}', '\u{03B1}'),
    ('\u{03AF}', '\u{03B9}'), ('\u{03CA}', '\u{03B9}'), ('\u{0390}', '\u{03B9}'),
    ('\u{03CC}', '\u{03BF}'), ('\u{03CD}', '\u{03C5}'), ('\u{03CB}', '\u{03C5}'),
];

/// Letras con acento cuya base no se parece sola, pero sí con el acento
/// («ӱ» ≈ «ü»): se marcan aunque la base no esté en [`PAIRS`].
const LOOKALIKE_BASES: [char; 2] = ['\u{0423}', '\u{0443}'];

fn base(c: char) -> char {
    COMPOSED
        .iter()
        .find(|&&(composed, _)| composed == c)
        .map_or(c, |&(_, base)| base)
}

/// Letras latinas escritas con otra forma: anchos completos (U+FF21–FF3A,
/// U+FF41–FF5A) y latinas matemáticas (U+1D400–1D6A3). Están en la lista y
/// además cuentan como latinas para (B).
fn styled_latin(c: char) -> bool {
    matches!(c, '\u{FF21}'..='\u{FF3A}' | '\u{FF41}'..='\u{FF5A}' | '\u{1D400}'..='\u{1D6A3}')
}

fn is_confusable(c: char) -> bool {
    let folded = base(c);
    PAIRS.iter().any(|&(other, _)| other == folded)
        || (folded != c && LOOKALIKE_BASES.contains(&folded))
        || styled_latin(c)
}

fn is_latin(c: char) -> bool {
    c.is_ascii_alphabetic()
        || styled_latin(c)
        || ((('\u{C0}'..='\u{24F}').contains(&c) || ('\u{1E00}'..='\u{1EFF}').contains(&c))
            && c.is_alphabetic()
            && !is_confusable(c))
}

/// Letra propia de otro alfabeto: ni latina ni de la lista («И», «π», «ゲ»).
fn own_letter(c: char) -> bool {
    c.is_alphabetic() && !combining(c) && !is_latin(c) && !is_confusable(c)
}

/// Acentos combinables: «е» + «◌̈» (NFD) debe contar igual que «ё» (NFC).
fn combining(c: char) -> bool {
    matches!(
        c,
        '\u{0300}'..='\u{036F}' | '\u{1AB0}'..='\u{1AFF}' | '\u{1DC0}'..='\u{1DFF}'
            | '\u{20D0}'..='\u{20FF}' | '\u{FE20}'..='\u{FE2F}'
    )
}

/// Un acento o un invisible que no es espacio pertenece a la palabra: partirla
/// con ellos no debe esconder la mezcla.
fn in_word(c: char) -> bool {
    c.is_alphanumeric() || combining(c) || (invisible(c) && !c.is_whitespace())
}

fn in_segment(c: char) -> bool {
    !c.is_whitespace() && !matches!(c, '\\' | '/' | '=' | ',' | ';' | '"')
}

/// Tramos `[inicio, fin)` máximos de caracteres que cumplen `keep`.
fn runs(chars: &[char], keep: fn(char) -> bool) -> Vec<(usize, usize)> {
    let mut spans = Vec::new();
    let mut start = None;
    for (i, &c) in chars.iter().enumerate() {
        match (keep(c), start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                spans.push((s, i));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        spans.push((s, chars.len()));
    }
    spans
}

/// Dónde empieza la extensión: tras el último punto, con algo delante y de 1 a
/// 5 caracteres de palabra. Una más larga se trata como parte del nombre.
fn extension(segment: &[char]) -> Option<usize> {
    let dot = segment.iter().rposition(|&c| c == '.')?;
    let ext = &segment[dot + 1..];
    (dot > 0 && (1..=5).contains(&ext.len()) && ext.iter().all(|&c| in_word(c))).then_some(dot + 1)
}

fn mark_segment(segment: &[char], marks: &mut [bool]) {
    let stem_len = extension(segment).unwrap_or(segment.len());
    for (mark, &c) in marks[stem_len..].iter_mut().zip(&segment[stem_len..]) {
        *mark = !c.is_ascii();
    }
    let stem = &segment[..stem_len];
    let latin_context = stem.iter().any(|&c| is_latin(c)) && !stem.iter().any(|&c| own_letter(c));
    for (start, end) in runs(stem, in_word) {
        let word = &stem[start..end];
        let latin = word.iter().any(|&c| is_latin(c));
        let only_listed = !latin && !word.iter().any(|&c| own_letter(c));
        if latin || (only_listed && latin_context) {
            for i in start..end {
                marks[i] =
                    is_confusable(stem[i]) || (i > start && marks[i - 1] && combining(stem[i]));
            }
        }
    }
}

/// Por carácter: `true` si se muestra como `[U+XXXX]` por parecer latino. Los
/// acentos que siguen a uno marcado se marcan con él para no montarse en «]».
pub(super) fn marked(text: &str) -> Vec<bool> {
    let chars: Vec<char> = text.chars().collect();
    let mut marks = vec![false; chars.len()];
    for (start, end) in runs(&chars, in_segment) {
        mark_segment(&chars[start..end], &mut marks[start..end]);
    }
    marks
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code(c: char) -> String {
        format!("U+{:04X}", u32::from(c))
    }

    #[test]
    fn the_lists_are_well_formed_and_not_silently_shortened() {
        assert_eq!(PAIRS.len(), 55);
        for (i, &(c, latin)) in PAIRS.iter().enumerate() {
            assert!(!c.is_ascii() && latin.is_ascii_alphabetic(), "{}", code(c));
            assert!(!PAIRS[..i].iter().any(|&(o, _)| o == c), "{}", code(c));
        }
        assert_eq!(COMPOSED.len(), 34);
        for (i, &(composed, base)) in COMPOSED.iter().enumerate() {
            let known = PAIRS.iter().any(|&(o, _)| o == base) || LOOKALIKE_BASES.contains(&base);
            assert!(known, "{}", code(composed));
            assert!(
                !COMPOSED[..i].iter().any(|&(o, _)| o == composed),
                "{}",
                code(composed)
            );
            assert!(
                !PAIRS.iter().any(|&(o, _)| o == composed),
                "{}",
                code(composed)
            );
        }
    }

    #[test]
    fn every_pair_and_composed_form_is_marked_next_to_a_latin_letter() {
        let listed = PAIRS.iter().chain(&COMPOSED).map(|&(c, _)| c);
        for c in listed {
            assert_eq!(
                marked(&format!("x{c}y")),
                [false, true, false],
                "{}",
                code(c)
            );
        }
        assert_eq!(
            marked("x\u{FF42}\u{FF3A}\u{1D41E}"),
            [false, true, true, true]
        );
        assert_eq!(
            marked("x\u{FF20}\u{FF5B}\u{0423}"),
            [false, false, false, false]
        );
    }
}
