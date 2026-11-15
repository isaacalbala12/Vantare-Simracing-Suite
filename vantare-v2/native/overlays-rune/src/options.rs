//! Argumentos compatibles con el supervisor actual, sin inicializar Rune.
use std::{ffi::OsString, path::PathBuf};

/// Modo sintético de desarrollo: nunca concede acceso en una distribución release.
pub const LOCAL_PREVIEW_ENABLED: bool = cfg!(debug_assertions);

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Source {
    Local,
    Pipe(Option<String>),
}

#[derive(Debug, PartialEq, Eq)]
pub struct Options {
    pub layout: Option<PathBuf>,
    pub benchmark_count: Option<usize>,
    pub source: Source,
    pub controlled: bool,
    pub start_hidden: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArgumentError {
    MissingValue,
    Duplicate,
    Unknown,
    InvalidSource,
    ConflictingLayout,
    DevelopmentOnly,
}

impl std::fmt::Display for ArgumentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::MissingValue => "falta el valor de --layout o --fuente",
            Self::Duplicate => "argumento repetido",
            Self::Unknown => "argumento desconocido",
            Self::InvalidSource => "fuente inválida; usa local, pipe o pipe:<nombre>",
            Self::ConflictingLayout => "no combines un número de medición con --layout",
            Self::DevelopmentOnly => {
                "--fuente local solo está disponible en compilaciones de desarrollo (debug)"
            }
        })
    }
}

impl std::error::Error for ArgumentError {}

pub fn parse(args: impl IntoIterator<Item = OsString>) -> Result<Options, ArgumentError> {
    parse_for_build(args, LOCAL_PREVIEW_ENABLED)
}

fn parse_for_build(
    args: impl IntoIterator<Item = OsString>,
    local_preview: bool,
) -> Result<Options, ArgumentError> {
    let mut result = Options {
        layout: None,
        benchmark_count: None,
        source: Source::Pipe(None),
        controlled: false,
        start_hidden: false,
    };
    let mut source_seen = false;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("--layout") if result.layout.is_none() => {
                let path = args.next().ok_or(ArgumentError::MissingValue)?;
                if path.is_empty() {
                    return Err(ArgumentError::MissingValue);
                }
                result.layout = Some(path.into());
            }
            Some("--fuente") if !source_seen => {
                source_seen = true;
                let value = args.next().ok_or(ArgumentError::MissingValue)?;
                result.source = match value.to_str() {
                    Some("local") if local_preview => Source::Local,
                    Some("local") => return Err(ArgumentError::DevelopmentOnly),
                    Some("pipe") => Source::Pipe(None),
                    Some(value) => match value.strip_prefix("pipe:") {
                        Some(name) if !name.is_empty() => Source::Pipe(Some(name.into())),
                        _ => return Err(ArgumentError::InvalidSource),
                    },
                    None => return Err(ArgumentError::InvalidSource),
                };
            }
            Some("--control-stdin") if !result.controlled => result.controlled = true,
            Some("--start-hidden") if !result.start_hidden => result.start_hidden = true,
            Some("--layout" | "--fuente" | "--control-stdin" | "--start-hidden") => {
                return Err(ArgumentError::Duplicate);
            }
            Some(value @ ("1" | "4" | "22")) if result.benchmark_count.is_none() => {
                result.benchmark_count = Some(match value {
                    "1" => 1,
                    "4" => 4,
                    _ => 22,
                });
            }
            _ => return Err(ArgumentError::Unknown),
        }
    }
    if result.layout.is_some() && result.benchmark_count.is_some() {
        return Err(ArgumentError::ConflictingLayout);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(args: &[&str]) -> Result<Options, ArgumentError> {
        parse_for_build(args.iter().map(OsString::from), true)
    }

    #[test]
    fn distribution_policy_rejects_local_but_preserves_real_feed() {
        assert_eq!(
            parse_for_build(["--fuente", "local"].map(OsString::from), false),
            Err(ArgumentError::DevelopmentOnly)
        );
        assert_eq!(
            parse_for_build(Vec::new(), false)
                .expect("pipe de distribución")
                .source,
            Source::Pipe(None)
        );
        let actual = parse(["--fuente", "local"].map(OsString::from));
        if cfg!(debug_assertions) {
            assert_eq!(actual.expect("desarrollo explícito").source, Source::Local);
        } else {
            assert_eq!(actual, Err(ArgumentError::DevelopmentOnly));
        }
    }

    #[test]
    fn supervisor_flags_preserve_named_feed_and_hidden_start() {
        let options = read(&[
            "--start-hidden",
            "--fuente",
            "pipe:qa-photo",
            "--control-stdin",
        ])
        .expect("argumentos del supervisor");
        assert_eq!(options.source, Source::Pipe(Some("qa-photo".into())));
        assert!(options.controlled && options.start_hidden);
        assert_eq!(options.layout, None);
        assert_eq!(options.benchmark_count, None);
    }

    #[test]
    fn default_uses_real_feed_and_layout_while_local_is_explicit() {
        assert_eq!(read(&[]).expect("defaults").source, Source::Pipe(None));
        let local = read(&["--layout", "qa-layout.json", "--fuente", "local"]).expect("local");
        assert_eq!(local.source, Source::Local);
        assert_eq!(local.layout, Some(PathBuf::from("qa-layout.json")));
        assert!(!local.controlled);
    }

    #[test]
    fn rejects_bad_or_repeated_inputs_and_never_forwards_rune_graphics_flags() {
        for args in [
            vec!["--fuente"],
            vec!["--layout"],
            vec!["--fuente", "pipe:"],
            vec!["--layout", ""],
            vec!["--control-stdin", "--control-stdin"],
            vec!["--fuente", "local", "--fuente", "pipe"],
            vec!["--snap", "screen.png"],
            vec!["--frames", "2"],
            vec!["3"],
        ] {
            assert!(read(&args).is_err(), "{args:?}");
        }
        assert_eq!(
            read(&["4", "--layout", "qa.json"]),
            Err(ArgumentError::ConflictingLayout)
        );
    }

    #[test]
    fn existing_measurement_counts_are_explicit_and_do_not_select_local_implicitly() {
        for count in [1, 4, 22] {
            let options = read(&[&count.to_string()]).expect("medición");
            assert_eq!(options.benchmark_count, Some(count));
            assert_eq!(options.source, Source::Pipe(None));
        }
    }
}
