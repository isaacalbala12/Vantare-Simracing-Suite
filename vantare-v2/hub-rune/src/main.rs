use rune::{AppSpec, Cx, El, col};

fn view(_: &(), _: &mut Cx<()>) -> El {
    col().key("hub").w_full().h_full()
}

fn main() {
    rune::run(AppSpec::new("Vantare", (1280.0, 800.0), || (), view));
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};

    #[test]
    fn empty_window_has_a_root_without_graphics() {
        let mut runtime = Runtime::new(
            (),
            view,
            (1280.0, 800.0),
            Env {
                system_dark: true,
                scale: 1.0,
            },
        );
        runtime.frame(0.0);
        assert!(runtime.find("hub").is_some());
        assert_eq!(vantare_hub_host::frame::LIMIT, 1024 * 1024);
    }
}
