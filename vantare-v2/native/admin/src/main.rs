#![forbid(unsafe_code)]
use gpui::{App, AppContext, Bounds, TitlebarOptions, WindowBounds, WindowOptions, px, size};
use vantare_admin::{state::Screen, view::Admin};
use vantare_hub::orbit;

fn run() -> Result<(), String> {
    let mut demo = false;
    let mut diagnose = false;
    let mut screen = Screen::Users;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--diagnose-owner" => diagnose = true,
            "--demo" => demo = true,
            "--screen" => {
                screen = match args.next().as_deref() {
                    Some("users") => Screen::Users,
                    Some("rollout") => Screen::Rollout,
                    Some("reports") => Screen::Reports,
                    _ => return Err("pantalla: users | rollout | reports".into()),
                }
            }
            "--help" => {
                println!(
                    "vantare-admin [--demo] [--screen users|rollout|reports] [--diagnose-owner]"
                );
                return Ok(());
            }
            _ => return Err("argumento desconocido; usa --help".into()),
        }
    }
    if diagnose {
        if demo {
            return Err("El diagnóstico real no se combina con --demo".into());
        }
        return vantare_services::app::default_root()
            .and_then(|root| vantare_admin::session::diagnose_owner(&root))
            .map_err(|error| format!("diagnóstico owner: {error:?}"));
    }
    let failure = std::rc::Rc::new(std::cell::RefCell::new(None));
    let result = failure.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        cx.on_window_closed(|cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        cx.set_global(orbit::theme::Theme::default());
        if let Err(error) = vantare_ui::efficiency::text::register_fonts(cx) {
            *failure.borrow_mut() = Some(error);
            cx.quit();
            return;
        }
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                None,
                size(px(1280.0), px(800.0)),
                cx,
            ))),
            window_min_size: Some(size(px(960.0), px(650.0))),
            titlebar: Some(TitlebarOptions {
                title: Some("Vantare Admin · owner".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        if cx
            .open_window(options, |window, cx| {
                orbit::theme::install(orbit::theme::AppearanceSettings::default(), window, cx);
                cx.new(|cx| Admin::new(demo, screen, cx))
            })
            .is_err()
        {
            *failure.borrow_mut() = Some("no se pudo abrir la ventana admin".into());
            cx.quit();
        }
    });
    let error = result.borrow_mut().take();
    error.map_or(Ok(()), Err)
}
fn main() -> std::process::ExitCode {
    match run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("vantare-admin: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}
