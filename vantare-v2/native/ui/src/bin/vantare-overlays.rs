//! Proceso de overlays. Uso:
//! `vantare-overlays [1|4|22] [--fuente local|pipe[:<nombre>]]` abre ese número
//! de widgets (campaña de medición), todos en una ventana por monitor, con los
//! datos del núcleo por su named pipe (`pipe`, por defecto, con el nombre por
//! defecto de `vantare-core`) o de una carrera sintética (`local`). Con la
//! feature `parity-capture`, `vantare-overlays --parity-capture <png>` captura
//! Standings con la escena fija.

use std::process::ExitCode;

use vantare_domain::format::Preferences;

const USAGE: &str = "uso: vantare-overlays [1|4|22] [--fuente local|pipe[:<nombre>]]";

#[derive(Debug, PartialEq)]
enum Feed {
    Local,
    /// `None`: el nombre por defecto del usuario.
    Pipe(Option<String>),
}

impl std::str::FromStr for Feed {
    type Err = ();

    fn from_str(text: &str) -> Result<Self, ()> {
        match text.split_once(':') {
            None if text == "local" => Ok(Self::Local),
            None if text == "pipe" => Ok(Self::Pipe(None)),
            Some(("pipe", name)) if !name.is_empty() => Ok(Self::Pipe(Some(name.into()))),
            _ => Err(()),
        }
    }
}

/// Sin número, un widget; si no, exactamente 1, 4 o 22. La fuente es opcional.
fn parse(args: &[String]) -> Option<(usize, Feed)> {
    let (mut count, mut feed) = (None, Feed::Pipe(None));
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if arg == "--fuente" {
            feed = args.next()?.parse().ok()?;
        } else if count.is_none() {
            count = Some(arg.parse().ok().filter(|n| matches!(n, 1 | 4 | 22))?);
        } else {
            return None;
        }
    }
    Some((count.unwrap_or(1), feed))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    #[cfg(feature = "parity-capture")]
    if let [flag, path] = args.as_slice()
        && flag == "--parity-capture"
    {
        return vantare_ui::capture::run(path.into());
    }
    let Some((windows, feed)) = parse(&args) else {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    };
    let snapshots = match feed {
        Feed::Local => Ok(vantare_ui::source::local_feed()),
        Feed::Pipe(name) => name
            .map_or_else(vantare_ipc::default_pipe_name, Ok)
            .map_err(Into::into)
            .and_then(|name| vantare_ui::source::pipe_feed(&name)),
    };
    let snapshots = match snapshots {
        Ok(snapshots) => snapshots,
        Err(error) => {
            eprintln!("vantare-overlays: {error}");
            return ExitCode::FAILURE;
        }
    };
    vantare_ui::run(windows, snapshots, Preferences::default());
    ExitCode::SUCCESS
}

#[cfg(test)]
mod tests {
    use super::{Feed, parse};

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).into()).collect()
    }

    #[test]
    fn only_the_measured_window_counts_are_accepted() {
        let pipe = || Feed::Pipe(None);
        assert_eq!(parse(&args(&[])), Some((1, pipe())));
        assert_eq!(parse(&args(&["4"])), Some((4, pipe())));
        assert_eq!(
            parse(&args(&["22", "--fuente", "local"])),
            Some((22, Feed::Local))
        );
        assert_eq!(
            parse(&args(&["--fuente", "local", "4"])),
            Some((4, Feed::Local))
        );
        assert_eq!(parse(&args(&["3"])), None);
        assert_eq!(parse(&args(&["x"])), None);
        assert_eq!(parse(&args(&["1", "4"])), None);
        // Un modo retirado: ya no existe.
        assert_eq!(parse(&args(&["--ventanas", "una"])), None);
    }

    #[test]
    fn the_source_is_local_or_a_pipe_with_an_optional_name() {
        let feed = |text: &str| parse(&args(&["--fuente", text])).map(|(_, feed)| feed);
        assert_eq!(feed("local"), Some(Feed::Local));
        assert_eq!(feed("pipe"), Some(Feed::Pipe(None)));
        assert_eq!(feed("pipe:mio"), Some(Feed::Pipe(Some("mio".into()))));
        assert_eq!(feed("pipe:"), None);
        assert_eq!(feed("local:x"), None);
        assert_eq!(feed("tcp"), None);
        assert_eq!(parse(&args(&["--fuente"])), None);
    }
}
