//! Proceso de overlays. Uso: `vantare-overlays [1|4|22] [--ventanas por-widget|una]`
//! abre ese número de widgets (campaña de medición), cada uno en su ventana
//! (`por-widget`, por defecto) o todos en una ventana por monitor (`una`). Con la
//! feature `parity-capture`, `vantare-overlays --parity-capture <png>` captura
//! Standings con la escena fija.

use std::process::ExitCode;

use vantare_domain::format::Preferences;
use vantare_ui::Grouping;

/// Sin número, un widget; si no, exactamente 1, 4 o 22. `--ventanas` es opcional.
fn parse(args: &[String]) -> Option<(usize, Grouping)> {
    let (mut count, mut grouping) = (None, Grouping::PerWidget);
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if arg == "--ventanas" {
            grouping = args.next()?.parse().ok()?;
        } else if count.is_none() {
            count = Some(arg.parse().ok().filter(|n| matches!(n, 1 | 4 | 22))?);
        } else {
            return None;
        }
    }
    Some((count.unwrap_or(1), grouping))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    #[cfg(feature = "parity-capture")]
    if let [flag, path] = args.as_slice()
        && flag == "--parity-capture"
    {
        return vantare_ui::capture::run(path.into());
    }
    let Some((windows, grouping)) = parse(&args) else {
        eprintln!("uso: vantare-overlays [1|4|22] [--ventanas por-widget|una]");
        return ExitCode::from(2);
    };
    // Mientras el IPC no esté integrado: fuente local de prueba. Aquí se
    // enchufará el receptor del `Subscriber` de `ipc`.
    let snapshots = vantare_ui::source::local_feed();
    vantare_ui::run(windows, grouping, snapshots, Preferences::default());
    ExitCode::SUCCESS
}

#[cfg(test)]
mod tests {
    use super::{Grouping, parse};

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).into()).collect()
    }

    #[test]
    fn only_the_measured_window_counts_and_known_groupings_are_accepted() {
        assert_eq!(parse(&args(&[])), Some((1, Grouping::PerWidget)));
        assert_eq!(parse(&args(&["4"])), Some((4, Grouping::PerWidget)));
        assert_eq!(
            parse(&args(&["22", "--ventanas", "una"])),
            Some((22, Grouping::OneWindow))
        );
        assert_eq!(
            parse(&args(&["--ventanas", "una", "4"])),
            Some((4, Grouping::OneWindow))
        );
        assert_eq!(parse(&args(&["3"])), None);
        assert_eq!(parse(&args(&["x"])), None);
        assert_eq!(parse(&args(&["1", "4"])), None);
        assert_eq!(parse(&args(&["--ventanas"])), None);
        assert_eq!(parse(&args(&["--ventanas", "dos"])), None);
    }
}
