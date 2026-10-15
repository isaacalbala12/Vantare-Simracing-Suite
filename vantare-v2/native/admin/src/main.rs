#![forbid(unsafe_code)]
use gpui::{App, AppContext, Bounds, TitlebarOptions, WindowBounds, WindowOptions, px, size};
use vantare_admin::{state::Screen, view::Admin};
use vantare_hub::orbit;

fn run() -> Result<(), String> {
    let mut demo = false;
    let mut diagnose = false;
    let mut scene = String::from("normal");
    let mut screen = Screen::Users;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--diagnose-owner" => diagnose = true,
            "--demo" => demo = true,
            "--scene" => scene = args.next().ok_or("Falta la escena")?,
            "--screen" => {
                screen = match args.next().as_deref() {
                    Some("login") => Screen::Login,
                    Some("creators") => Screen::Creators,
                    Some("users") => Screen::Users,
                    Some("rollout") => Screen::Rollout,
                    Some("reports") => Screen::Reports,
                    Some("mail") => Screen::Mail,
                    _ => {
                        return Err(
                            "pantalla: login | users | creators | rollout | reports | mail".into(),
                        );
                    }
                }
            }
            "--help" => {
                println!(
                    "vantare-admin [--demo] [--screen login|users|creators|rollout|reports|mail] [--scene normal|cargando|vacio|error|ana|owner|eva|bloquear|borrar|carlos|pablo|nuevo|informe|arreglado|rechazado|mail-editor|mail-confirm|mail-history|mail-forget|mail-cleanup] [--diagnose-owner]"
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
        return vantare_admin::session::data_root()
            .and_then(|root| vantare_admin::session::diagnose_owner(&root))
            .map_err(|error| format!("diagnóstico owner: {error:?}"));
    }
    let failure = std::rc::Rc::new(std::cell::RefCell::new(None));
    let result = failure.clone();
    gpui_platform::application()
        .with_assets(AdminAssets)
        .run(move |cx: &mut App| {
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
                    title: Some("Vantare · Gestión".into()),
                    ..Default::default()
                }),
                ..Default::default()
            };
            if cx
                .open_window(options, |window, cx| {
                    orbit::theme::install(orbit::theme::AppearanceSettings::default(), window, cx);
                    let mut theme = cx.global::<orbit::theme::Theme>().clone();
                    theme.skin.l2 = 0x0012_1316;
                    theme.skin.text2 = 0x00f5_f3f2;
                    theme.skin.radius.sm = 14.0;
                    cx.set_global(theme);
                    cx.new(|cx| {
                        let mut admin = Admin::new(demo, screen, cx);
                        if demo && let Err(error) = admin.demo_scene(&scene, cx) {
                            eprintln!("{error}");
                        }
                        admin
                    })
                })
                .is_err()
            {
                *failure.borrow_mut() = Some("no se pudo abrir la ventana admin".into());
                cx.quit();
            } else {
                cx.activate(true);
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

struct AdminAssets;
impl gpui::AssetSource for AdminAssets {
    fn load(&self, path: &str) -> gpui::Result<Option<std::borrow::Cow<'static, [u8]>>> {
        let bytes: Option<&'static [u8]> = match path {
            "people.svg" => Some(include_bytes!("../assets/people.svg")),
            "star.svg" => Some(include_bytes!("../assets/star.svg")),
            "flag.svg" => Some(include_bytes!("../assets/flag.svg")),
            "grid.svg" => Some(include_bytes!("../assets/grid.svg")),
            "strategy.svg" => Some(include_bytes!("../assets/strategy.svg")),
            "engineer.svg" => Some(include_bytes!("../assets/engineer.svg")),
            "analysis.svg" => Some(include_bytes!("../assets/analysis.svg")),
            "calendar.svg" => Some(include_bytes!("../assets/calendar.svg")),
            _ => None,
        };
        Ok(bytes.map(std::borrow::Cow::Borrowed))
    }
    fn list(&self, path: &str) -> gpui::Result<Vec<gpui::SharedString>> {
        Ok([
            "people.svg",
            "star.svg",
            "flag.svg",
            "grid.svg",
            "strategy.svg",
            "engineer.svg",
            "analysis.svg",
            "calendar.svg",
        ]
        .into_iter()
        .filter(|name| name.starts_with(path))
        .map(Into::into)
        .collect())
    }
}
