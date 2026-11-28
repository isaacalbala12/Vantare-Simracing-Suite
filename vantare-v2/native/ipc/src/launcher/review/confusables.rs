//! Letras y signos que imitan a los latinos (#2579).
//!
//! Se muestran como `[U+XXXX]`:
//! - siempre, los puntos, barras, guiones y el `;` griego que imitan a los
//!   ASCII (`steam․exe` con U+2024);
//! - (B) en una palabra con alguna letra latina o de estilo latino, toda letra
//!   de un bloque de riesgo (cirílico, griego, armenio, cherokee, lisu, IPA,
//!   anchos completos…): «Stеam», «obs６４»;
//! - (C) en una palabra hecha de letras de un solo alfabeto de riesgo y sin
//!   latín, sus letras de riesgo si el texto tiene latín y ninguna letra propia
//!   de ESE alfabeto: `C:\common\АСС\асс.exe`, `C:\СССР.exe`, `АССー2024`;
//! - en una palabra que mezcla dos alfabetos de riesgo («Ѕκуре»: cirílico y
//!   griego), todas sus letras de riesgo.
//!
//! No se toca un texto con letras propias del mismo alfabeto
//! (`C:\Users\Иван\Игры\хор.exe`, «Касперский», «Παιχνίδι») salvo sus palabras
//! mezcladas con latín. CJK, kana y hangul no son de riesgo («PCゲーム»), y el
//! ancho completo junto a ellos, en una palabra sin letras ASCII, tampoco
//! («ＰＣゲーム», «第２章»). Los dígitos y números de estilo latino no cuentan
//! como letras («Игра２», «F1 ⅓»).
//!
//! La ruta del programa se bloquea (sin tablas) si no tiene una extensión ASCII
//! alfanumérica (`steam.ехе`, `steam·exe`, `steam`), si lleva un punto o una
//! barra que imitan a los ASCII, o si termina en espacio o punto o lleva `:`
//! fuera de la unidad: Windows recorta lo último y `::$DATA` abre el mismo
//! archivo.
//!
//! Sin tablas Unicode completas: NFC y NFD dan el mismo veredicto porque las
//! letras precompuestas de la lista ([`COMPOSED`]) se pliegan a su letra base y
//! los acentos combinables ([`combining`]) cuentan como parte de la palabra.

use super::invisible;

/// Letras de otro alfabeto que se confunden con una latina. Lo que no está aquí
/// (ni es lisu, cherokee o de estilo latino, que se confunden siempre) es una
/// letra «propia», que decide el contexto de (C) y de (A).
#[rustfmt::skip]
const PAIRS: [(char, char); 73] = [
    ('\u{04C0}', 'l'), ('\u{A646}', 'I'), ('\u{A647}', 'i'), ('\u{051A}', 'Q'),
    ('\u{051C}', 'W'), ('\u{04BA}', 'h'), ('\u{04AF}', 'y'),
    ('\u{037F}', 'J'), ('\u{03F3}', 'j'),
    ('\u{0585}', 'o'), ('\u{0555}', 'O'), ('\u{057D}', 'u'), ('\u{054D}', 'U'),
    ('\u{0570}', 'h'), ('\u{0578}', 'n'), ('\u{0566}', 'q'), ('\u{0581}', 'g'),
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
    ('\u{03F2}', 'c'), ('\u{03BC}', 'u'),
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
/// («ӱ» ≈ «ü»).
const LOOKALIKE_BASES: [char; 2] = ['\u{0423}', '\u{0443}'];

/// Puntos y barras que imitan `.`, `\` y `/`: se marcan siempre y, en la ruta
/// del programa, bloquean la confianza.
#[rustfmt::skip]
const PATH_PUNCTUATION: [char; 19] = [
    '\u{2024}', '\u{FF0E}', '\u{FE52}', '\u{A4F8}', '\u{0701}', '\u{0702}',
    '\u{0660}', '\u{06F0}',
    '\u{2215}', '\u{2044}', '\u{29F5}', '\u{29F8}', '\u{29F9}', '\u{2216}',
    '\u{FF0F}', '\u{FF3C}', '\u{FE68}', '\u{2571}', '\u{2572}',
];

/// Guiones que imitan `-` y el `;` griego: se marcan siempre.
#[rustfmt::skip]
const OTHER_PUNCTUATION: [char; 7] = [
    '\u{2010}', '\u{2011}', '\u{2012}', '\u{2212}', '\u{FE63}', '\u{FF0D}', '\u{037E}',
];

#[derive(Clone, Copy, PartialEq, Eq)]
enum Script {
    Cyrillic,
    Greek,
    Armenian,
    Cherokee,
    Lisu,
    LatinLike,
}

/// Bloque de riesgo: letras que pueden pasar por latinas en una ruta.
fn script(c: char) -> Option<Script> {
    Some(match c {
        '\u{0400}'..='\u{052F}' | '\u{1C80}'..='\u{1C8F}' | '\u{A640}'..='\u{A69F}' => {
            Script::Cyrillic
        }
        '\u{0370}'..='\u{03FF}' | '\u{1F00}'..='\u{1FFF}' => Script::Greek,
        '\u{0530}'..='\u{058F}' => Script::Armenian,
        '\u{13A0}'..='\u{13FF}' | '\u{AB70}'..='\u{ABBF}' => Script::Cherokee,
        '\u{A4D0}'..='\u{A4FF}' => Script::Lisu,
        '\u{0131}'
        | '\u{01C0}'..='\u{01C3}'
        | '\u{0250}'..='\u{02AF}'
        | '\u{1D00}'..='\u{1DBF}'
        | '\u{2100}'..='\u{218F}'
        | '\u{FF10}'..='\u{FF19}'
        | '\u{FF21}'..='\u{FF3A}'
        | '\u{FF41}'..='\u{FF5A}'
        | '\u{1D400}'..='\u{1D7FF}' => Script::LatinLike,
        _ => return None,
    })
}

fn base(c: char) -> char {
    COMPOSED
        .iter()
        .find(|&&(composed, _)| composed == c)
        .map_or(c, |&(_, base)| base)
}

/// Se confunde con una latina: está en [`PAIRS`] (o es su forma precompuesta)
/// o es de estilo latino (IPA, anchos completos, matemáticas…).
fn is_confusable(c: char) -> bool {
    let folded = base(c);
    PAIRS.iter().any(|&(other, _)| other == folded)
        || (folded != c && LOOKALIKE_BASES.contains(&folded))
        || matches!(
            script(c),
            Some(Script::LatinLike | Script::Lisu | Script::Cherokee)
        )
}

fn is_latin(c: char) -> bool {
    c.is_ascii_alphabetic()
        || ((('\u{C0}'..='\u{24F}').contains(&c) || ('\u{1E00}'..='\u{1EFF}').contains(&c))
            && c.is_alphabetic()
            && script(c).is_none())
}

/// Letra propia de otro alfabeto: no latina ni confundible («И», «π», «ゲ»).
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

/// Kana, CJK y hangul: junto a ellos el ancho completo es la forma normal.
fn cjk(c: char) -> bool {
    matches!(
        c,
        '\u{1100}'..='\u{11FF}' | '\u{3040}'..='\u{30FF}' | '\u{3130}'..='\u{318F}'
            | '\u{31F0}'..='\u{31FF}' | '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}'
            | '\u{AC00}'..='\u{D7AF}' | '\u{F900}'..='\u{FAFF}' | '\u{FF66}'..='\u{FF9F}'
    )
}

fn full_width(c: char) -> bool {
    matches!(c, '\u{FF10}'..='\u{FF19}' | '\u{FF21}'..='\u{FF3A}' | '\u{FF41}'..='\u{FF5A}')
}

/// Letras del turco junto a las que la «ı» sin punto es legítima («Işık»).
fn turkish(c: char) -> bool {
    matches!(
        c,
        '\u{15E}'
            | '\u{15F}'
            | '\u{11E}'
            | '\u{11F}'
            | '\u{C7}'
            | '\u{E7}'
            | '\u{130}'
            | '\u{D6}'
            | '\u{F6}'
            | '\u{DC}'
            | '\u{FC}'
    )
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

/// El programa no tiene una extensión ASCII: la parte tras el último punto del
/// ÚLTIMO segmento (tras el último `\` o `/`) falta, está vacía o tiene algo
/// que no es ASCII alfanumérico. Ningún ejecutable legítimo de Windows está así,
/// y `CreateProcess` ejecuta un programa se llame como se llame, así que no hay
/// tablas: `steam.ехе`, `steam·exe` (sin punto ASCII), `steam` o `C:\Juegos\`
/// (segmento vacío) bloquean; `.exe` (punto inicial) no.
///
/// No se recorta nada por el final: un invisible que quede en la extensión no
/// es ASCII y la bloquea (`steam.exe` + U+200B es otro archivo).
fn lacks_ascii_extension(chars: &[char]) -> bool {
    let segment = chars
        .iter()
        .rposition(|&c| matches!(c, '\\' | '/'))
        .map_or(chars, |i| &chars[i + 1..]);
    segment.iter().rposition(|&c| c == '.').is_none_or(|dot| {
        let ext = &segment[dot + 1..];
        ext.is_empty() || ext.iter().any(|c| !c.is_ascii_alphanumeric())
    })
}

/// Windows recorta el espacio o el punto final y `:` fuera de la unidad abre un
/// flujo del mismo archivo (`steam.ехе::$DATA`). Nada legítimo lo necesita.
fn trimmed_by_windows(chars: &[char]) -> bool {
    let device = chars.len() >= 4
        && matches!(chars[0], '\\' | '/')
        && matches!(chars[1], '\\' | '/')
        && matches!(chars[2], '?' | '.')
        && matches!(chars[3], '\\' | '/');
    let drive = if device { 4 } else { 0 };
    chars.last().is_some_and(|&c| c == '.' || c.is_whitespace())
        || chars
            .iter()
            .enumerate()
            .any(|(i, &c)| c == ':' && !(i == drive + 1 && chars[drive].is_ascii_alphabetic()))
}

fn mark(chars: &[char]) -> Vec<bool> {
    let mut marks = vec![false; chars.len()];
    let latin_text = chars.iter().any(|&c| is_latin(c));
    let own_in = |script_of: Script| {
        chars
            .iter()
            .any(|&c| own_letter(c) && script(c) == Some(script_of))
    };
    for (start, end) in runs(chars, in_word) {
        let word = &chars[start..end];
        let turkish_word = word.iter().any(|&c| turkish(c));
        // Con una letra ASCII la palabra es latina: una kana no esconde «Stｅamー».
        let cjk_word = word.iter().any(|&c| cjk(c)) && !word.iter().any(char::is_ascii_alphabetic);
        let risky = |c: char| {
            script(c).is_some() && !(c == '\u{131}' && turkish_word) && !(full_width(c) && cjk_word)
        };
        // Solo las letras deciden: un dígito o un número de estilo latino no.
        let letter = |c: char| risky(c) && c.is_alphabetic();
        let mut scripts = word
            .iter()
            .copied()
            .filter(|&c| letter(c))
            .filter_map(script);
        let first = scripts.next();
        let two_scripts = scripts.any(|other| Some(other) != first);
        let latin = word
            .iter()
            .any(|&c| is_latin(c) || (letter(c) && script(c) == Some(Script::LatinLike)));
        let lookalike_word = first.is_some_and(|only| latin_text && !own_in(only));
        if two_scripts || latin || lookalike_word {
            for i in start..end {
                marks[i] = risky(chars[i]) || (i > start && marks[i - 1] && combining(chars[i]));
            }
        }
    }
    for (flag, c) in marks.iter_mut().zip(chars) {
        *flag |= PATH_PUNCTUATION.contains(c) || OTHER_PUNCTUATION.contains(c);
    }
    marks
}

/// Por carácter: `true` si se muestra como `[U+XXXX]` por imitar a uno latino.
/// Los acentos que siguen a uno marcado se marcan con él para no montarse en «]».
pub(super) fn marked(text: &str) -> Vec<bool> {
    mark(&text.chars().collect::<Vec<_>>())
}

/// La ruta del programa se disfraza: no tiene extensión ASCII, tiene un punto o
/// una barra que imitan a los ASCII, o Windows la recorta. Bloquea la confianza.
pub(super) fn disguised_path(text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    chars.iter().any(|c| PATH_PUNCTUATION.contains(c))
        || lacks_ascii_extension(&chars)
        || trimmed_by_windows(&chars)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code(c: char) -> String {
        format!("U+{:04X}", u32::from(c))
    }

    #[test]
    fn the_lists_have_no_duplicates_and_point_at_known_letters() {
        for (i, &(c, latin)) in PAIRS.iter().enumerate() {
            assert!(
                script(c).is_some() && latin.is_ascii_alphabetic(),
                "{}",
                code(c)
            );
            assert!(!PAIRS[..i].iter().any(|&(o, _)| o == c), "{}", code(c));
        }
        for (i, &(composed, base)) in COMPOSED.iter().enumerate() {
            let known = PAIRS.iter().any(|&(o, _)| o == base) || LOOKALIKE_BASES.contains(&base);
            assert!(known, "{}", code(composed));
            assert!(
                !COMPOSED[..i].iter().any(|&(o, _)| o == composed),
                "{}",
                code(composed)
            );
        }
    }

    #[test]
    fn every_listed_letter_and_sign_is_marked_next_to_a_latin_letter() {
        let listed = PAIRS.iter().chain(&COMPOSED).map(|&(c, _)| c);
        for c in listed.chain(PATH_PUNCTUATION).chain(OTHER_PUNCTUATION) {
            let marks = marked(&format!("x{c}y"));
            assert_eq!(marks, [false, true, false], "{}", code(c));
        }
    }

    #[test]
    fn every_listed_letter_counts_as_lookalike_for_the_whole_text_rule() {
        // (C): una palabra hecha solo de una letra de la lista, en un texto latino.
        for c in PAIRS.iter().chain(&COMPOSED).map(|&(c, _)| c) {
            assert_eq!(
                marked(&format!("ab {c}")),
                [false, false, false, true],
                "{}",
                code(c)
            );
        }
    }
}
