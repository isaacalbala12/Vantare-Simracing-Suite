mod bootstrap;
mod catalog;
#[cfg(any(windows, test))]
mod client;
mod design;
mod host;
mod icons;
#[cfg(windows)]
mod pipe;
use catalog::{catalog, text};
use design::{Theme, button, label, menu_item, surface};
use rune::{AppSpec, Cx, El, col, icon, row};
struct State {
    theme: Theme,
    dark: bool,
    collapsed: bool,
    section: String,
    link: Option<host::Link>,
}
fn init() -> State {
    State {
        theme: Theme::load("vantare", "dark").expect("shared tokens"),
        dark: true,
        collapsed: false,
        section: "home".into(),
        link: None,
    }
}
fn toggle(state: &mut State) {
    state.dark = !state.dark;
    state.theme =
        Theme::load("vantare", if state.dark { "dark" } else { "light" }).expect("shared tokens");
}
fn title(state: &State) -> &str {
    catalog()["navigation"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == state.section)
        .and_then(|e| e["label"].as_str())
        .unwrap_or(text("es.title"))
}
fn view(state: &State, _: &mut Cx<State>) -> El {
    let theme = &state.theme;
    let mut sidebar = col()
        .key("sidebar")
        .w(if state.collapsed { 76.0 } else { 248.0 })
        .h_full()
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .padding(12.0)
        .gap(8.0)
        .fill(theme.color("bg-sidebar"))
        .role("navigation")
        .label(text("settings.shell.sidebar"))
        .child(label(
            theme,
            if state.collapsed {
                "V"
            } else {
                text("shell.brand")
            },
        ))
        .child(button(
            theme,
            "sidebar-toggle",
            if state.collapsed {
                text("shell.sidebarExpand")
            } else {
                text("shell.sidebarCollapse")
            },
            |s: &mut State| s.collapsed = !s.collapsed,
        ));
    for entry in catalog()["navigation"].as_array().unwrap() {
        let id = entry["id"].as_str().unwrap();
        let name = entry["label"].as_str().unwrap();
        let target = id.to_owned();
        let image = icon(icons::shared_icon(entry["icon"].as_str().unwrap()), 20.0)
            .color(theme.color("text-1"))
            .a11y_hidden();
        let item = menu_item(
            theme,
            &format!("nav-{id}"),
            name,
            id == state.section,
            state.collapsed,
            image,
            move |s: &mut State| s.section = target.clone(),
        );
        sidebar = sidebar.child(item);
    }
    let header = row()
        .key("header")
        .w_full()
        .padding(16.0)
        .gap(24.0)
        .child(label(theme, title(state)).grow(1.0))
        .child(button(
            theme,
            "theme-toggle",
            text("settings.shell.toggleTheme"),
            toggle,
        ));
    row()
        .key("hub")
        .w_full()
        .h_full()
        .fill(theme.color("bg-window"))
        .child(sidebar)
        .child(
            col().grow(1.0).h_full().child(header).child(
                surface(theme)
                    .key("section")
                    .grow(1.0)
                    .child(label(theme, title(state))),
            ),
        )
}
fn setup(state: &mut State, waker: rune::Waker) {
    if let Some(link) = &mut state.link {
        link.wake_with(waker);
    }
}
fn poll(state: &mut State, _: f64, tx: &mut rune::Tx) -> bool {
    if let Some(link) = &mut state.link {
        for _ in 0..64 {
            match link.receive() {
                Some(Ok(vantare_hub_host::protocol::HostToUi::CloseRequested { .. }))
                | Some(Err(_)) => {
                    tx.quit();
                    return true;
                }
                Some(Ok(_)) => {}
                None => break,
            }
        }
    }
    false
}
fn start() -> std::io::Result<()> {
    // Consume and erase ephemeral bootstrap before Rune or workers start threads.
    let bootstrap = bootstrap::consume()?;
    let arguments = bootstrap::arguments(std::env::args().skip(1))?;
    let (link, hello) = host::Link::open(bootstrap)?;
    let ready = link.sender();
    let mut state = init();
    let mut size = (1440.0, 900.0);
    if let vantare_hub_host::protocol::HostToUi::Hello {
        version,
        theme,
        window,
        ..
    } = hello
    {
        if version != vantare_hub_host::protocol::VERSION {
            return Err(std::io::ErrorKind::InvalidData.into());
        }
        let palette = serde_json::to_value(theme.palette)?;
        let scheme = serde_json::to_value(theme.scheme)?;
        state.dark = scheme.as_str() != Some("light");
        state.theme = Theme::load(
            palette.as_str().ok_or(std::io::ErrorKind::InvalidData)?,
            if state.dark { "dark" } else { "light" },
        )
        .map_err(|_| std::io::ErrorKind::InvalidData)?;
        size = (
            f32::from(window.width).clamp(1280.0, 3840.0),
            f32::from(window.height).clamp(720.0, 2160.0),
        );
    }
    let mut link = link;
    link.send(vantare_hub_host::protocol::UiToHost::Request {
        id: 1,
        request: vantare_hub_host::protocol::Request::CoreGet {},
    })?;
    link.send(vantare_hub_host::protocol::UiToHost::Subscribe {
        topic: vantare_hub_host::protocol::Topic::Core,
    })?;
    state.link = Some(link);

    let mut spec = AppSpec::new("Vantare · Hub", size, init, view);
    spec.min_size = Some((1280.0, 720.0));
    spec.fonts = design::FONTS;
    spec.families = ("Inter", "Inter");
    spec.scenes = &[
        ("light", |s| {
            if s.dark {
                toggle(s);
            }
        }),
        ("dark", |_| {}),
        ("collapsed", |s| s.collapsed = true),
    ];
    spec.setup = Some(setup);
    spec.poll = Some(poll);
    let app = rune::App::new(spec)
        .init(move || state)
        .args(arguments)
        .tab_visits_controls(true);
    let handle = app.handle();
    app.on_ready(move |_| {
        if ready.as_ref().is_some_and(|sender| {
            sender
                .try_send(vantare_hub_host::protocol::UiToHost::Ready {})
                .is_err()
        }) {
            handle.quit();
        }
    })
    .try_run()
    .map_err(std::io::Error::other)
}
fn main() -> std::process::ExitCode {
    if start().is_err() {
        eprintln!("No se pudo preparar el Hub Rune con el anfitrión.");
        return std::process::ExitCode::FAILURE;
    }
    std::process::ExitCode::SUCCESS
}
#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    #[test]
    fn frame_contains_electron_sections_in_both_sidebar_modes() {
        let entries = catalog()["navigation"].as_array().unwrap();
        assert_eq!(
            entries
                .iter()
                .map(|e| e["id"].as_str().unwrap())
                .collect::<Vec<_>>(),
            [
                "home", "launcher", "studio", "roadmap", "testing", "calendar", "strategy",
                "engineer", "settings"
            ]
        );
        for collapsed in [true, false] {
            let mut state = init();
            state.collapsed = collapsed;
            let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
            runtime.frame(0.0);
            for entry in entries {
                assert!(
                    runtime
                        .find(&format!("nav-{}", entry["id"].as_str().unwrap()))
                        .is_some()
                );
            }
            let (x, y) = runtime.find("nav-roadmap").unwrap();
            runtime.pointer_down(x, y);
            runtime.pointer_up(x, y);
            runtime.frame(0.1);
            assert_eq!(runtime.state.section, "roadmap");
        }
    }
}
