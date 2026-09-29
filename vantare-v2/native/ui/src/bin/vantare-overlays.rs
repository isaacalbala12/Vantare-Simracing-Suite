//! Proceso de overlays. Uso: `vantare-overlays [1|4|22]` abre ese número de
//! ventanas (campaña de medición). Con la feature `parity-capture`,
//! `vantare-overlays --parity-capture <png>` captura Standings con la escena fija.

use std::process::ExitCode;

use vantare_domain::format::Preferences;

/// Sin argumento, una ventana; si no, exactamente 1, 4 o 22.
fn window_count(args: &[String]) -> Option<usize> {
    match args {
        [] => Some(1),
        [count] => count.parse().ok().filter(|n| matches!(n, 1 | 4 | 22)),
        _ => None,
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    #[cfg(feature = "parity-capture")]
    if let [flag, path] = args.as_slice()
        && flag == "--parity-capture"
    {
        return vantare_ui::capture::run(path.into());
    }
    let Some(windows) = window_count(&args) else {
        eprintln!("uso: vantare-overlays [1|4|22]");
        return ExitCode::from(2);
    };
    // Mientras el IPC no esté integrado: fuente local de prueba. Aquí se
    // enchufará el receptor del `Subscriber` de `ipc`.
    let snapshots = vantare_ui::source::local_feed();
    vantare_ui::run(windows, snapshots, Preferences::default());
    ExitCode::SUCCESS
}

#[cfg(test)]
mod tests {
    use super::window_count;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).into()).collect()
    }

    #[test]
    fn only_the_measured_window_counts_are_accepted() {
        assert_eq!(window_count(&args(&[])), Some(1));
        assert_eq!(window_count(&args(&["4"])), Some(4));
        assert_eq!(window_count(&args(&["22"])), Some(22));
        assert_eq!(window_count(&args(&["3"])), None);
        assert_eq!(window_count(&args(&["x"])), None);
        assert_eq!(window_count(&args(&["1", "4"])), None);
    }
}
