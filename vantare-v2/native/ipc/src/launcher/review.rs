//! Private review pages shared by the host and the resident.
use serde::Deserialize;
use std::fmt::Write as _;

mod confusables;

const WRAP: usize = 76;
const BUDGET: usize = 26;
const MAX_PAGES: usize = 3;
pub const AUTHORIZATION_MS: u64 = 10_000;
/// Lo que cabe en una revisión.
const MAX_MESSAGE_BYTES: usize = 64 * 1024;
/// Hasta aquí se juzga la ruta de un programa; más larga es «demasiado largo».
const MAX_PATH_CHARS: usize = 260;
/// Texto fijado por la raíz (#2579). Cabe en una línea de la página.
const CONFUSABLE_NOTICE: &str =
    "\nAtención: letras o signos que imitan a los normales, marcados así: [U+…].";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReviewError {
    Unavailable,
    TooLong,
    /// La ruta de un programa no es de fiar (#2579): no se ofrece «Confiar».
    /// El perfil no cambia.
    Blocked(BlockedReason),
}

/// Por qué se bloquea (#2881). Cerrado: el Hub tiene una frase para cada uno.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlockedReason {
    /// La ruta lleva un punto o una barra que imitan a los normales, o el
    /// nombre del archivo tiene una letra marcada como imitación.
    Lookalike,
    /// Todo lo demás que bloquea: la ruta no tiene la forma de un programa
    /// normal de Windows.
    UnusualPath,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Profile {
    name: String,
    startup: bool,
    hotkey: String,
    first_delay: u32,
    retries: u8,
    steps: Vec<Step>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Step {
    app: String,
    path: String,
    args: Vec<String>,
    steam: bool,
    delay: u32,
}

fn invisible(c: char) -> bool {
    matches!(
        c,
        '\u{0}'..='\u{1f}' | '\u{7f}'..='\u{9f}' | '\u{ad}' | '\u{61c}' | '\u{180e}'
            | '\u{200b}'..='\u{200f}' | '\u{2028}'..='\u{202e}' | '\u{2060}'..='\u{2069}' | '\u{feff}'
            | '\u{a0}' | '\u{2000}'..='\u{200a}' | '\u{202f}' | '\u{205f}' | '\u{3000}'
            | '\u{2800}' | '\u{3164}' | '\u{115f}'..='\u{1160}' | '\u{ffa0}' | '\u{34f}'
            | '\u{fe00}'..='\u{fe0f}' | '\u{180b}'..='\u{180d}' | '\u{e0000}'..='\u{e007f}'
            | '\u{fff9}'..='\u{fffb}'
    )
}

/// Lo que se muestra de cada carácter: él mismo, o `[U+XXXX]` si es invisible o
/// imita a uno latino.
fn shown(text: &str, marks: Vec<bool>) -> Vec<String> {
    text.chars()
        .zip(marks)
        .map(|(c, marked)| {
            if marked || invisible(c) {
                format!("[U+{:04X}]", u32::from(c))
            } else {
                c.to_string()
            }
        })
        .collect()
}

fn visible(text: &str) -> String {
    shown(text, confusables::marked(text)).concat()
}

/// Recorta sin partir un `[U+XXXX]`.
fn label(text: &str, limit: usize) -> String {
    let parts = shown(text, confusables::marked(text));
    if parts.iter().map(|part| part.chars().count()).sum::<usize>() <= limit {
        return parts.concat();
    }
    let mut output = String::new();
    let mut used = 0;
    for part in parts {
        let width = part.chars().count();
        if used + width > limit - 1 {
            break;
        }
        output.push_str(&part);
        used += width;
    }
    output.push('…');
    output
}

fn argument(value: &str) -> String {
    let value = visible(value);
    if value.is_empty() || value.chars().any(|c| c.is_whitespace() || c == '"') {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value
    }
}

fn lines(text: &str) -> usize {
    text.split('\n')
        .map(|line| line.chars().count().div_ceil(WRAP).max(1))
        .sum()
}

impl Step {
    /// Una ruta vacía o demasiado larga no se juzga: tiene su propio error.
    fn blocked(&self) -> Option<BlockedReason> {
        if self.path.is_empty() || self.path.chars().count() > MAX_PATH_CHARS {
            return None;
        }
        confusables::blocked_path(&self.path)
    }

    fn check(&self) -> Result<(), ReviewError> {
        if self.path.chars().count() > MAX_PATH_CHARS
            || self.args.iter().any(|arg| arg.chars().count() > 200)
        {
            return Err(ReviewError::TooLong);
        }
        if self.path.is_empty() {
            return Err(ReviewError::Unavailable);
        }
        Ok(())
    }

    fn format(&self, number: usize) -> String {
        let mut output = format!("{number}. {}", label(&self.app, 40));
        if self.steam {
            output.push_str(" (se abre con Steam)");
        }
        if self.delay > 0 {
            write!(output, " · espera {} s", self.delay).expect("write to String");
        }
        write!(output, "\n   Programa: {}", visible(&self.path)).expect("write to String");
        let arguments: Vec<_> = self.args.iter().map(|arg| argument(arg)).collect();
        let single_line = format!("   Argumentos: {}", arguments.join(" "));
        if arguments.is_empty() {
            output.push_str("\n   Sin argumentos");
        } else if single_line.chars().count() <= WRAP {
            write!(output, "\n{single_line}").expect("write to String");
        } else {
            write!(output, "\n   Argumentos ({}):", arguments.len()).expect("write to String");
            let mut line = String::new();
            for arg in arguments {
                if !line.is_empty() && line.chars().count() + 1 + arg.chars().count() > WRAP - 5 {
                    write!(output, "\n     {line}").expect("write to String");
                    line.clear();
                }
                if !line.is_empty() {
                    line.push(' ');
                }
                line.push_str(&arg);
            }
            write!(output, "\n     {line}").expect("write to String");
        }
        output
    }
}

impl Profile {
    fn header(&self) -> String {
        let mut header = format!(
            "Perfil: «{}»\nOrigen: importado. Vantare no sabe quién lo creó y no puede comprobar que sea fiable.",
            label(&self.name, 60)
        );
        let texts: Vec<&String> = [&self.name, &self.hotkey]
            .into_iter()
            .chain(
                self.steps
                    .iter()
                    .flat_map(|step| [&step.app, &step.path].into_iter().chain(&step.args)),
            )
            .collect();
        if texts.iter().any(|text| text.chars().any(invisible)) {
            header.push_str(
                "\nAtención: contiene caracteres invisibles; aquí se muestran como [U+…].",
            );
        }
        if texts
            .iter()
            .any(|text| confusables::marked(text).contains(&true))
        {
            header.push_str(CONFUSABLE_NOTICE);
        }
        header
    }

    fn footer(&self) -> String {
        let startup = if self.startup {
            "se abre solo"
        } else {
            "no se abre solo"
        };
        let hotkey = if self.hotkey.is_empty() {
            "ninguno".to_owned()
        } else {
            visible(&self.hotkey)
        };
        let mut options = format!("Al iniciar Windows: {startup} · Atajo: {hotkey}");
        if self.first_delay != 0 {
            write!(
                options,
                " · Espera {} s antes del primer paso",
                self.first_delay
            )
            .expect("write to String");
        }
        if self.retries != 0 {
            let unit = if self.retries == 1 { "vez" } else { "veces" };
            write!(
                options,
                " · Si falla, lo reintenta hasta {} {unit}",
                self.retries
            )
            .expect("write to String");
        }
        format!(
            "\n{options}\n\nPulsa «Confiar y lanzar» solo si reconoces todos los programas. Vantare recordará exactamente este contenido y volverá a preguntar si cambia algo."
        )
    }
}

/// El bloqueo gana a cualquier otro error de los pasos (#2903): si alguno está
/// bloqueado, decide el primero de los bloqueados, haya lo que haya delante. Por
/// eso se juzga también un mensaje que no cabe en la revisión, hasta lo que cabe
/// en el estado del residente.
pub fn review_pages(message: &str) -> Result<Vec<String>, ReviewError> {
    let profile = (message.len() <= super::MAX_STATUS_BYTES)
        .then(|| serde_json::from_str::<Profile>(message).ok())
        .flatten();
    if let Some(reason) = profile
        .as_ref()
        .and_then(|profile| profile.steps.iter().find_map(Step::blocked))
    {
        return Err(ReviewError::Blocked(reason));
    }
    if message.len() > MAX_MESSAGE_BYTES {
        return Err(ReviewError::TooLong);
    }
    let profile = profile.ok_or(ReviewError::Unavailable)?;
    for step in &profile.steps {
        step.check()?;
    }
    let header = profile.header();
    if profile.steps.is_empty() {
        return Ok(vec![format!(
            "Este perfil importado no tiene pasos\n{header}\n\nNo hay ninguna aplicación que revisar ni que lanzar. Pulsa «Cancelar» para cancelar el lanzamiento."
        )]);
    }
    let last = profile.footer();
    let next = "\nSigue en la parte siguiente.";
    let available = BUDGET.saturating_sub(lines(&header) + 1 + lines(&last).max(lines(next)));
    let mut blocks = Vec::new();
    let mut page = Vec::new();
    let mut used = 0;
    let total = profile.steps.len();
    for (index, step) in profile.steps.iter().enumerate() {
        let block = step.format(index + 1);
        let needed = lines(&block);
        if needed > available {
            return Err(ReviewError::TooLong);
        }
        if used + needed > available {
            blocks.push(std::mem::take(&mut page));
            if blocks.len() >= MAX_PAGES {
                return Err(ReviewError::TooLong);
            }
            used = 0;
        }
        page.push(block);
        used += needed;
    }
    blocks.push(page);
    let count = blocks.len();
    let noun = if total == 1 {
        "el paso".to_owned()
    } else {
        format!("los {total} pasos")
    };
    Ok(blocks
        .into_iter()
        .enumerate()
        .map(|(index, page)| {
            let part = if count == 1 {
                String::new()
            } else {
                format!(" (parte {} de {count})", index + 1)
            };
            let footer = if index + 1 == count { &last } else { next };
            format!(
                "Revisa {noun} de este perfil importado{part}\n{header}\n\n{}\n{footer}",
                page.join("\n")
            )
        })
        .collect())
}

/// Counts and lengths in bytes, encoded as big-endian u64, that delimit the exact display strings.
pub fn frame_pages(pages: &[String]) -> Vec<u8> {
    let mut bytes = (pages.len() as u64).to_be_bytes().to_vec();
    for page in pages {
        bytes.extend_from_slice(&(page.len() as u64).to_be_bytes());
        bytes.extend_from_slice(page.as_bytes());
    }
    bytes
}

pub fn can_trust(pages: &[String]) -> bool {
    pages
        .first()
        .is_some_and(|page| page.starts_with("Revisa "))
}

pub fn authorization_current(issued_ms: u64, now_ms: u64) -> bool {
    now_ms
        .checked_sub(issued_ms)
        .is_some_and(|age| age <= AUTHORIZATION_MS)
}
