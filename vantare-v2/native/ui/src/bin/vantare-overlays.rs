//! Proceso de overlays. Uso:
//! `vantare-overlays [1|4|22] [--fuente local|pipe[:<nombre>]]` abre ese número
//! de widgets (campaña de medición), todos en una ventana por monitor, con los
//! datos del núcleo por su named pipe (`pipe`, por defecto, con el nombre por
//! defecto de `vantare-core`) o de una carrera sintética (`local`). Con la
//! feature `parity-capture`, `vantare-overlays --parity-capture <png>` captura
//! Standings con la escena fija.

use vantare_ipc::product;

use std::path::PathBuf;
use std::process::ExitCode;

use vantare_domain::format::Preferences;

const USAGE: &str = "uso: vantare-overlays [1|4|22 | --layout <layout.json>] [--fuente local|pipe[:<nombre>]]; sin número vigila el layout de LOCALAPPDATA";

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

/// Un número explícito conserva la campaña; sin él se usa el documento de layout.
fn parse(args: &[String]) -> Option<(Option<usize>, Option<PathBuf>, Feed)> {
    let (mut count, mut layout, mut feed) = (None, None, Feed::Pipe(None));
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if arg == "--fuente" {
            feed = args.next()?.parse().ok()?;
        } else if arg == "--layout" && layout.is_none() {
            layout = Some(args.next()?.into());
        } else if count.is_none() {
            count = Some(arg.parse().ok().filter(|n| matches!(n, 1 | 4 | 22))?);
        } else {
            return None;
        }
    }
    if count.is_some() && layout.is_some() {
        return None;
    }
    Some((count, layout, feed))
}

fn main() -> ExitCode {
    if product::print_version() {
        return ExitCode::SUCCESS;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-overlays");
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let start_hidden = args.first().is_some_and(|arg| arg == "--start-hidden");
    if start_hidden {
        args.remove(0);
    }
    #[cfg(feature = "parity-capture")]
    if let [flag, path] = args.as_slice()
        && flag == "--parity-capture"
    {
        return vantare_ui::capture::run(path.into());
    }
    let Some((windows, layout, feed)) = parse(&args) else {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    };
    let rights = match &feed {
        Feed::Local => None,
        Feed::Pipe(name) => {
            let result = (|| -> std::io::Result<_> {
                let name = name
                    .clone()
                    .map_or_else(vantare_ipc::default_pipe_name, Ok)?;
                vantare_ipc::control::Feed::connect(
                    &name,
                    std::env::current_exe()?.with_file_name("vantare-core.exe"),
                )
            })();
            if let Ok(feed) = result {
                Some(feed)
            } else {
                eprintln!("vantare-overlays: control de derechos no disponible");
                return ExitCode::FAILURE;
            }
        }
    };
    if windows.is_none()
        && let Feed::Pipe(name) = &feed
    {
        let result = (|| -> Result<(), Box<dyn std::error::Error>> {
            let path = layout
                .clone()
                .map_or_else(vantare_ui::layout::default_path, Ok)?;
            let document = vantare_ui::layout::Document::open(path.clone())?;
            let handle = vantare_ui::source::DemandHandle::new(document.layout().demand());
            let name = name
                .clone()
                .map_or_else(vantare_ipc::default_pipe_name, Ok)?;
            let photos = vantare_ui::source::layout_feed(&name, handle.clone())?;
            vantare_ui::run_layout_requested_hidden(path, photos, rights, handle, start_hidden)?;
            Ok(())
        })();
        return match result {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("vantare-overlays: {error}");
                ExitCode::FAILURE
            }
        };
    }
    let snapshots = match feed {
        Feed::Local => Ok(vantare_ui::source::local_feed()),
        Feed::Pipe(name) => name
            .map_or_else(vantare_ipc::default_pipe_name, Ok)
            .map_err(Into::into)
            .and_then(|name| {
                let mut demand = vantare_ipc::Demand::default();
                for index in 0..windows.unwrap_or(0) {
                    let kind = [
                        vantare_ui::Kind::Standings,
                        vantare_ui::Kind::Radar,
                        vantare_ui::Kind::Pedals,
                    ][index % 3];
                    demand.union(&vantare_ui::Settings::default_for(kind).demand());
                }
                vantare_ui::source::pipe_feed_requested(&name, demand)
            }),
    };
    let snapshots = match snapshots {
        Ok(snapshots) => snapshots,
        Err(error) => {
            eprintln!("vantare-overlays: {error}");
            return ExitCode::FAILURE;
        }
    };
    if let Some(windows) = windows {
        vantare_ui::run_with_rights(windows, snapshots, Preferences::default(), rights);
    } else {
        let result = layout
            .map_or_else(vantare_ui::layout::default_path, Ok)
            .and_then(|path| vantare_ui::run_layout_with_rights(path, snapshots, rights));
        if let Err(error) = result {
            eprintln!("vantare-overlays: {error}");
            return ExitCode::FAILURE;
        }
    }
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
        assert_eq!(parse(&args(&[])), Some((None, None, pipe())));
        assert_eq!(parse(&args(&["4"])), Some((Some(4), None, pipe())));
        assert_eq!(
            parse(&args(&["22", "--fuente", "local"])),
            Some((Some(22), None, Feed::Local))
        );
        assert_eq!(
            parse(&args(&["--fuente", "local", "4"])),
            Some((Some(4), None, Feed::Local))
        );
        assert_eq!(parse(&args(&["3"])), None);
        assert_eq!(parse(&args(&["x"])), None);
        assert_eq!(parse(&args(&["1", "4"])), None);
        // Un modo retirado: ya no existe.
        assert_eq!(parse(&args(&["--ventanas", "una"])), None);
    }

    #[test]
    fn the_source_is_local_or_a_pipe_with_an_optional_name() {
        let feed = |text: &str| parse(&args(&["--fuente", text])).map(|(_, _, feed)| feed);
        assert_eq!(feed("local"), Some(Feed::Local));
        assert_eq!(feed("pipe"), Some(Feed::Pipe(None)));
        assert_eq!(feed("pipe:mio"), Some(Feed::Pipe(Some("mio".into()))));
        assert_eq!(feed("pipe:"), None);
        assert_eq!(feed("local:x"), None);
        assert_eq!(feed("tcp"), None);
        assert_eq!(parse(&args(&["--fuente"])), None);
    }

    #[test]
    fn layout_path_and_measurement_count_are_exclusive() {
        assert_eq!(
            parse(&args(&["--layout", "my-layout.json"])),
            Some((None, Some("my-layout.json".into()), Feed::Pipe(None)))
        );
        assert_eq!(parse(&args(&["--layout"])), None);
        assert_eq!(parse(&args(&["--layout", "a", "--layout", "b"])), None);
        assert_eq!(parse(&args(&["4", "--layout", "a"])), None);
    }
}
