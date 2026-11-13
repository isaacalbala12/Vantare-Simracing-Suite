use rune::{AppSpec, Cx, El, col, text};

fn view(_: &(), _: &mut Cx<()>) -> El {
    col()
        .w_full()
        .h_full()
        .center()
        .child(text("Hola, Vantare").key("saludo"))
}

const PROCEDENCIA: &str = concat!(
    "Vantare=",
    env!("VANTARE_BUILD_SHA"),
    ";dirty=",
    env!("VANTARE_BUILD_DIRTY"),
    ";Rune=d5338988a7c1b3377adb60853815b6d0843dae7c;Rust=1.99.1;release;opt-level=3;lto=false;codegen-units=16;incremental=false;features=default"
);

fn main() {
    eprintln!("{PROCEDENCIA}");
    rune::run(AppSpec::new(
        "Vantare · prueba Rune",
        (640.0, 360.0),
        || (),
        view,
    ));
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};

    #[test]
    fn saludo_presente_sin_dispositivo_grafico() {
        let mut runtime = Runtime::new(
            (),
            view,
            (640.0, 360.0),
            Env {
                system_dark: true,
                scale: 1.0,
            },
        );
        runtime.frame(0.0);
        assert!(runtime.find("saludo").is_some());
    }
}
