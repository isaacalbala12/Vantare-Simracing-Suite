use std::{ffi::OsStr, process::ExitCode};

const GRAPHICS_DISABLED: &str = "Overlays Rune: gráficos desactivados por VANTARE_SIN_GRAFICOS; no se crea ventana ni dispositivo.";

// No inicializar Rune, leer sus argumentos ni crear hilos antes de este guard.
fn main() -> ExitCode {
    if graphics_disabled(std::env::var_os("VANTARE_SIN_GRAFICOS").as_deref()) {
        eprintln!("{GRAPHICS_DISABLED}");
        return ExitCode::FAILURE;
    }

    // ADR 0110, PR 4: la conexión al supervisor y las ventanas llegan en PR 5.
    eprintln!("Overlays Rune: base preparada; proceso y ventanas pendientes del PR 5.");
    ExitCode::FAILURE
}

fn graphics_disabled(value: Option<&OsStr>) -> bool {
    value == Some(OsStr::new("1"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Cx, El, Env, Runtime, col, text};

    #[test]
    fn server_guard_rejects_graphics_without_reading_arguments() {
        assert!(graphics_disabled(Some(OsStr::new("1"))));
        assert!(!graphics_disabled(None));
        assert!(!graphics_disabled(Some(OsStr::new("0"))));
    }

    // Runtime calcula layout y accesibilidad en CPU; no usar rune::run, App,
    // ventanas ni Painter/preview GPU dentro del servidor o de la CI.
    #[test]
    fn rune_layout_is_available_without_a_window_or_device() {
        fn view(_: &(), _: &mut Cx<()>) -> El {
            col()
                .w_full()
                .h_full()
                .child(text("Relative").key("widget"))
        }
        let mut runtime = Runtime::new((), view, (320.0, 200.0), Env::new(true, 1.0));
        runtime.frame(0.0);
        assert!(runtime.find("widget").is_some());
    }
}
