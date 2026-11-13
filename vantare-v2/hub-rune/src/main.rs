mod design;
use design::{Theme, button, label, menu_item, surface};
use rune::{AppSpec, Cx, El, col};
struct State {
    theme: Theme,
    dark: bool,
}
fn init() -> State {
    State {
        theme: Theme::load("vantare", "dark").expect("shared tokens"),
        dark: true,
    }
}
fn toggle(state: &mut State) {
    state.dark = !state.dark;
    state.theme =
        Theme::load("vantare", if state.dark { "dark" } else { "light" }).expect("shared tokens");
}
fn view(state: &State, _: &mut Cx<State>) -> El {
    let theme = &state.theme;
    col()
        .key("hub")
        .w_full()
        .h_full()
        .padding(32.0)
        .gap(16.0)
        .fill(theme.color("bg-window"))
        .child(label(theme, "VANTARE"))
        .child(
            surface(theme)
                .child(label(theme, "Componentes Vantare"))
                .child(button(theme, "theme-toggle", "Claro / oscuro", toggle))
                .child(menu_item(
                    theme,
                    "sample-menu",
                    "Inicio",
                    true,
                    |_: &mut State| {},
                )),
        )
}
fn main() {
    let mut spec = AppSpec::new("Vantare · Hub", (1440.0, 900.0), init, view);
    spec.fonts = design::FONTS;
    spec.families = ("Inter", "Inter");
    spec.scenes = &[
        ("light", |s| {
            if s.dark {
                toggle(s);
            }
        }),
        ("dark", |_| {}),
    ];
    rune::run(spec);
}
#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    #[test]
    fn specimen_renders_in_both_schemes_without_graphics() {
        for dark in [true, false] {
            let mut state = init();
            if !dark {
                toggle(&mut state);
            }
            let mut runtime = Runtime::new(
                state,
                view,
                (1440.0, 900.0),
                Env {
                    system_dark: dark,
                    scale: 1.0,
                },
            );
            runtime.frame(0.0);
            assert!(runtime.find("theme-toggle").is_some());
            assert!(runtime.find("sample-menu").is_some());
        }
    }
}
