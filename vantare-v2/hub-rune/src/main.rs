mod bootstrap;
mod catalog;
#[cfg(any(windows, test))]
mod client;
mod design;
mod home;
mod home_assets;
mod home_view;
mod host;
mod icons;
#[cfg(windows)]
mod pipe;
mod roadmap;
mod roadmap_view;
use catalog::{catalog, text};
use design::{Theme, button, label, menu_item, surface};
use rune::{AppSpec, Cx, El, col, icon, row};
struct State {
    theme: Theme,
    dark: bool,
    collapsed: bool,
    section: String,
    link: Option<host::Link>,
    closing: bool,
    close_deadline: Option<f64>,
    window: Option<rune::AppHandle<State>>,
    core: vantare_hub_host::protocol::CoreStatus,
    roadmap: roadmap::Roadmap,
    home: home::Home,
    home_assets: Option<home_view::Assets>,
}
fn init() -> State {
    State {
        theme: Theme::load("vantare", "dark").expect("shared tokens"),
        dark: true,
        collapsed: false,
        section: "home".into(),
        link: None,
        closing: false,
        close_deadline: None,
        window: None,
        core: Default::default(),
        roadmap: Default::default(),
        home: Default::default(),
        home_assets: None,
    }
}
fn toggle(state: &mut State) {
    state.dark = !state.dark;
    state.theme =
        Theme::load("vantare", if state.dark { "dark" } else { "light" }).expect("shared tokens");
    if let Some(assets) = &mut state.home_assets {
        assets.update(&state.theme);
        assets.track(
            &state.theme,
            state
                .home
                .value
                .as_ref()
                .and_then(|v| v.sim.track.as_deref()),
        );
    }
}
// Closed capture presets; no product startup or release environment override.
#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
fn capture_preset(state: &mut State, preset: &str) -> Result<(), &'static str> {
    let (screen, scheme) = preset
        .rsplit_once('-')
        .ok_or("capture preset needs a theme")?;
    if !["light", "dark"].contains(&scheme) {
        return Err("unknown capture theme");
    }
    let (section, collapsed, tab) = match screen {
        "frame-expanded" => ("home", false, "board"),
        "frame-collapsed" => ("home", true, "board"),
        "home" => ("home", true, "board"),
        "roadmap" => ("roadmap", true, "circuit"),
        "roadmap-board" => ("roadmap", true, "board"),
        "roadmap-season" => ("roadmap", true, "season"),
        _ => return Err("unknown capture screen"),
    };
    state.section = section.into();
    state.collapsed = collapsed;
    state.roadmap.tab = tab;
    state.dark = scheme == "dark";
    state.theme = Theme::load("vantare", scheme).expect("shared capture tokens");
    Ok(())
}
#[cfg(all(debug_assertions, target_os = "macos"))]
fn capture_scene(state: &mut State) {
    let preset = std::env::var("VANTARE_HUB_CAPTURE").expect("capture preset is required");
    capture_preset(state, &preset).expect("closed capture preset");
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
fn section_allowed(state: &State, section: &str) -> bool {
    match section {
        "testing" => state.core.access.verified && !state.core.access.blocked,
        "calendar" => {
            state.core.access.verified && !state.core.access.blocked && state.core.access.tester
        }
        _ => true,
    }
}
fn set_core(state: &mut State, value: vantare_hub_host::protocol::CoreStatus) {
    state.core = value;
    if !section_allowed(state, &state.section) {
        state.section = "home".into();
    }
}
fn view(state: &State, cx: &mut Cx<State>) -> El {
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
        if !section_allowed(state, id) {
            continue;
        }
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
        .child(
            label(
                theme,
                text(if state.core.live {
                    "shell.simulatorConnected"
                } else {
                    "shell.waitingSimulator"
                }),
            )
            .key("sim-status")
            .role("status"),
        )
        .child(button(
            theme,
            "theme-toggle",
            text("settings.shell.toggleTheme"),
            toggle,
        ));
    let mut body = col().grow(1.0).min_h(0.0).h_full().child(header);
    if state.core.services != vantare_hub_host::protocol::LinkState::Connected {
        body = body.child(
            label(theme, text("es.coreUnavailable"))
                .key("core-warning")
                .role("status"),
        );
    }
    let content = if state.section == "roadmap" {
        roadmap_view::view(state)
    } else if state.section == "home" {
        home_view::view(state, cx)
    } else {
        surface(theme)
            .key("section")
            .grow(1.0)
            .child(label(theme, title(state)))
    };
    row()
        .key("hub")
        .w_full()
        .h_full()
        .fill(theme.color("bg-window"))
        .child(sidebar)
        .child(body.child(content))
}

fn setup(state: &mut State, waker: rune::Waker) {
    state.home_assets = Some(home_view::Assets::new(waker.clone(), &state.theme));
    if let Some(link) = &mut state.link {
        link.wake_with(waker);
    }
}
fn request_close(state: &mut State, tx: &mut rune::Tx) {
    if state.closing {
        return;
    }
    state.closing = true;
    // Electron's window close handler uses request id 0 and waits for the host.
    if state.link.as_mut().is_none_or(|link| {
        link.send(vantare_hub_host::protocol::UiToHost::Request {
            id: 0,
            request: vantare_hub_host::protocol::Request::WindowClose {},
        })
        .is_err()
    }) {
        tx.quit();
        return;
    }
    let deadline = tx.clock() + 10.0;
    state.close_deadline = Some(deadline);
    tx.wake_at(deadline);
    // The scene answers synchronously; the real worker wakes poll after writing CloseAnswer.
    tx.wake_after(std::time::Duration::ZERO);
}
fn close_rejected(state: &mut State, error: &vantare_hub_host::protocol::HostError) -> bool {
    use vantare_hub_host::protocol::HostError;
    // The current host has no veto wire variant. Recover a typed rejection of id 0.
    if !matches!(
        error,
        HostError::Busy | HostError::Rejected | HostError::Denied | HostError::Protected
    ) {
        return false;
    }
    state.closing = false;
    state.close_deadline = None;
    if let Some(window) = &state.window {
        window.open();
    }
    true
}
fn close_expired(state: &State, now: f64, tx: &mut rune::Tx) -> bool {
    if let Some(deadline) = state.close_deadline {
        if now >= deadline {
            tx.quit();
            return true;
        }
        tx.wake_at(deadline);
    }
    false
}
fn poll(state: &mut State, now: f64, tx: &mut rune::Tx) -> bool {
    use vantare_hub_host::protocol::{Event, HostToUi, Reply};
    if close_expired(state, now, tx) {
        return true;
    }
    let mut changed = false;
    for _ in 0..64 {
        let message = state.link.as_mut().and_then(host::Link::receive);
        match message {
            Some(Ok(HostToUi::CloseRequested { .. })) | Some(Err(_)) => {
                state.closing = true;
                state.core = Default::default();
                tx.quit();
                return true;
            }
            Some(Ok(HostToUi::Failure { id: 0, error })) if state.closing => {
                if !close_rejected(state, &error) {
                    tx.quit();
                }
                return true;
            }
            Some(Ok(HostToUi::Response {
                id: 1,
                result: Reply::Core { value },
            }))
            | Some(Ok(HostToUi::Event {
                event: Event::Core { value },
            })) => {
                set_core(state, value);
                changed = true;
            }
            Some(Ok(HostToUi::Event {
                event: Event::SimStatus { live },
            })) => {
                state.core.live = live;
                changed = true;
            }
            Some(Ok(HostToUi::Event {
                event: Event::Home { value },
            })) => {
                changed |= state.home.event(value);
            }
            Some(Ok(HostToUi::Response {
                id,
                result: Reply::LauncherLaunch { accepted },
            })) => {
                changed |= state.home.finish_launch(id, accepted);
            }
            Some(Ok(HostToUi::Response {
                id,
                result: reply @ Reply::HomeGet { .. },
            })) => {
                changed |= state.home.accept(id, reply);
            }
            Some(Ok(HostToUi::Response { id, result })) => {
                changed |= state.roadmap.accept(id, result);
            }
            Some(Ok(HostToUi::Failure { id, .. })) => {
                changed |= state.roadmap.fail(id);
                changed |= state.home.fail(id);
                changed |= state.home.finish_launch(id, false);
            }
            Some(Ok(_)) => {}
            None => break,
        }
    }
    if changed && let Some(assets) = &mut state.home_assets {
        assets.track(
            &state.theme,
            state
                .home
                .value
                .as_ref()
                .and_then(|v| v.sim.track.as_deref()),
        );
    }
    let previous_launch_failure = state.home.launch_failed;
    if let Some(message) = state.home.next_launch(now, &state.core) {
        if let vantare_hub_host::protocol::UiToHost::Request { id, .. } = &message {
            let id = *id;
            if state
                .link
                .as_mut()
                .is_none_or(|link| link.send(message).is_err())
            {
                state.home.finish_launch(id, false);
            }
        }
        changed = true;
        tx.wake_at(now);
    }
    changed |= previous_launch_failure != state.home.launch_failed;
    let previous_failure = state.home.failed;
    for message in state.home.next(now, state.section == "home") {
        let id = match &message {
            vantare_hub_host::protocol::UiToHost::Request { id, .. } => Some(*id),
            _ => None,
        };
        if state
            .link
            .as_mut()
            .is_none_or(|link| link.send(message).is_err())
            && let Some(id) = id
        {
            state.home.fail(id);
        }
        changed = true;
        tx.wake_at(now);
    }
    changed |= previous_failure != state.home.failed;
    if let Some(due) = state.home.due() {
        tx.wake_at(due);
    }
    let previous_status = state.roadmap.status();
    if let Some(message) = state.roadmap.next(now, state.section == "roadmap") {
        if let vantare_hub_host::protocol::UiToHost::Request { id, .. } = &message
            && state
                .link
                .as_mut()
                .is_none_or(|link| link.send(message.clone()).is_err())
        {
            state.roadmap.fail(*id);
        }
        changed = true;
        tx.wake_at(now);
    }
    changed |= previous_status != state.roadmap.status();
    if let Some(due) = state.roadmap.due() {
        tx.wake_at(due);
    }
    changed
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
    link.send(vantare_hub_host::protocol::UiToHost::Subscribe {
        topic: vantare_hub_host::protocol::Topic::SimStatus,
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
        ("roadmap", |s| s.section = "roadmap".into()),
        ("home", |s| s.section = "home".into()),
        #[cfg(all(debug_assertions, target_os = "macos"))]
        ("capture", capture_scene),
    ];
    spec.setup = Some(setup);
    spec.poll = Some(poll);
    let app = rune::App::new(spec)
        .args(arguments)
        // Rune hides the window on X; retain its process until the host handshake completes.
        .keep_running()
        .on_close(request_close)
        .tab_visits_controls(true);
    let handle = app.handle();
    state.window = Some(handle.clone());
    app.init(move || state)
        .on_ready(move |_| {
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
    fn capture_presets_compose_screen_theme_sidebar_without_changing_host_data() {
        for screen in [
            "frame-expanded",
            "frame-collapsed",
            "home",
            "roadmap",
            "roadmap-board",
            "roadmap-season",
        ] {
            for theme in ["light", "dark"] {
                let mut state = init();
                capture_preset(&mut state, &format!("{screen}-{theme}")).unwrap();
                assert_eq!(state.dark, theme == "dark");
                assert_eq!(state.collapsed, screen != "frame-expanded");
                assert_eq!(
                    state.section,
                    if screen.starts_with("roadmap") {
                        "roadmap"
                    } else {
                        "home"
                    }
                );
                assert!(state.home.value.is_none());
                assert!(state.link.is_none());
            }
        }
        for invalid in ["roadmap", "home-blue", "launcher-dark"] {
            assert!(capture_preset(&mut init(), invalid).is_err());
        }
    }
    #[test]
    #[cfg(debug_assertions)]
    fn home_favorite_button_sends_one_scene_launch_and_selected_profile_is_respected() {
        use vantare_hub_host::protocol::{Request, UiToHost};
        let (mut link, _) =
            host::Link::open(bootstrap::Bootstrap::Scene("inicio-base".into())).unwrap();
        link.send(UiToHost::Request {
            id: 1,
            request: Request::CoreGet {},
        })
        .unwrap();
        let mut state = init();
        state.link = Some(link);
        let mut rt = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
        rt.poll = Some(poll);
        for _ in 0..4 {
            rt.frame(0.0);
        }
        let (x, y) = rt.find("home-launch-favorite").unwrap();
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        for _ in 0..4 {
            rt.frame(0.0);
        }
        let Some(host::Link::Scene(scene)) = rt.state.link.as_ref() else {
            unreachable!()
        };
        assert!(
            matches!(scene.launches.as_slice(), [Request::LauncherLaunch { profile, .. }] if profile == "carrera-lmu")
        );
        assert!(!rt.state.home.launch_failed);
        rt.update(|s, _| {
            s.home.selected = "entreno-rapido".into();
            s.home.queue_launch(&s.core, false);
        });
        for _ in 0..4 {
            rt.frame(0.0);
        }
        let Some(host::Link::Scene(scene)) = rt.state.link.as_ref() else {
            unreachable!()
        };
        assert!(
            matches!(&scene.launches[1], Request::LauncherLaunch { profile, .. } if profile == "entreno-rapido")
        );
    }
    #[test]
    #[cfg(debug_assertions)]
    fn home_scenes_load_empty_fail_and_reenter_without_losing_core_or_roadmap() {
        use vantare_hub_host::protocol::{Request, UiToHost};
        for scene in [
            "inicio-base",
            "inicio-vacio",
            "inicio-cargando",
            "inicio-error",
            "inicio-sin-diseno",
            "inicio-lanzando",
        ] {
            let (mut link, _) =
                host::Link::open(bootstrap::Bootstrap::Scene(scene.into())).unwrap();
            link.send(UiToHost::Request {
                id: 1,
                request: Request::CoreGet {},
            })
            .unwrap();
            let mut state = init();
            state.link = Some(link);
            let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
            runtime.poll = Some(poll);
            for _ in 0..4 {
                runtime.frame(0.0);
            }
            assert!(runtime.state.core.access.verified);
            assert_eq!(
                runtime.state.home.value.is_none(),
                scene == "inicio-cargando",
                "{scene}"
            );
            assert_eq!(
                runtime.state.home.failed,
                scene == "inicio-error",
                "{scene}"
            );
            for key in ["home-hero", "home-overlay", "home-activity", "home-rail"] {
                assert!(runtime.find(key).is_some(), "{scene}: {key}");
            }
            if scene == "inicio-base" {
                assert_eq!(runtime.state.home.value.as_ref().unwrap().profiles.len(), 3);
                assert_eq!(
                    runtime
                        .state
                        .home
                        .value
                        .as_ref()
                        .unwrap()
                        .favorite
                        .as_deref(),
                    Some("carrera-lmu")
                );
                assert!(
                    runtime
                        .elements()
                        .iter()
                        .any(|e| e.text.as_deref().is_some_and(|t| t.contains("Carrera LMU")))
                );
            }
            if scene == "inicio-vacio" {
                assert!(
                    runtime
                        .state
                        .home
                        .value
                        .as_ref()
                        .unwrap()
                        .profiles
                        .is_empty()
                );
                assert!(runtime.find("home-templates").is_some());
            }
            runtime.update(|state, _| state.section = "roadmap".into());
            for _ in 0..4 {
                runtime.frame(0.0);
            }
            assert!(runtime.state.roadmap.value.publication.is_some());
            runtime.update(|state, _| state.section = "home".into());
            for _ in 0..4 {
                runtime.frame(0.0);
            }
            assert!(runtime.find("home-hero").is_some());
        }
    }
    #[test]
    #[cfg(debug_assertions)]
    fn home_retry_and_studio_navigation_use_real_controls_and_respect_access() {
        let (link, _) =
            host::Link::open(bootstrap::Bootstrap::Scene("inicio-error".into())).unwrap();
        let mut state = init();
        state.link = Some(link);
        let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
        runtime.poll = Some(poll);
        // Two seconds of injected frame time let Rune's entering opacity spring settle.
        for _ in 0..120 {
            runtime.frame(1.0 / 60.0);
        }
        assert!(runtime.state.home.failed);
        let before = runtime.state.home.last_request_id();
        let (x, y) = runtime.find("home-retry").unwrap();
        assert!(
            runtime
                .elements()
                .iter()
                .any(|e| e.key.as_deref() == Some("home-retry") && e.opacity > 0.99),
            "advance the injected clock until the entering error panel is visible"
        );
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(0.1);
        for _ in 0..120 {
            runtime.frame(1.0 / 60.0);
        }
        assert!(
            runtime.state.home.last_request_id() > before,
            "retry must send a fresh request"
        );
        assert!(
            runtime.state.home.failed,
            "the error scene still rejects the retry"
        );
        let (x, y) = runtime.find("home-studio").unwrap();
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(0.1);
        assert_eq!(
            runtime.state.section, "home",
            "revoked access blocks Studio"
        );
        runtime.update(|state, _| state.core.access.verified = true);
        runtime.frame(0.1);
        let (x, y) = runtime.find("home-studio").unwrap();
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(0.1);
        assert_eq!(runtime.state.section, "studio");
    }
    #[test]
    #[cfg(debug_assertions)]
    fn native_close_waits_for_scene_host_and_acknowledgement() {
        let (link, _) =
            host::Link::open(bootstrap::Bootstrap::Scene("core-offline".into())).unwrap();
        let mut state = init();
        state.link = Some(link);
        let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
        runtime.update(request_close);
        assert!(runtime.state.closing);
        assert!(runtime.shell_request.is_none(), "X must wait for the host");
        // Repeated X must not enqueue another WindowClose.
        runtime.update(request_close);
        runtime.poll = Some(poll);
        runtime.frame(0.0);
        assert!(matches!(runtime.shell_request, Some(rune::Shell::Quit)));
        assert!(runtime.state.link.as_mut().unwrap().receive().is_none());
    }

    #[test]
    #[cfg(debug_assertions)]
    fn silent_scene_waits_for_host_guards_but_cannot_live_past_ten_seconds() {
        let (mut link, _) =
            host::Link::open(bootstrap::Bootstrap::Scene("core-offline".into())).unwrap();
        let host::Link::Scene(scene) = &mut link else {
            unreachable!()
        };
        scene.close_reply = host::CloseReply::Silent;
        let mut state = init();
        state.link = Some(link);
        let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
        runtime.poll = Some(poll);
        runtime.update(request_close);
        assert_eq!(runtime.state.close_deadline, Some(10.0));
        runtime.frame(5.1);
        assert!(
            runtime.shell_request.is_none(),
            "report-close may take five seconds"
        );
        runtime.frame(4.89);
        assert!(runtime.shell_request.is_none());
        runtime.update(request_close);
        assert_eq!(
            runtime.state.close_deadline,
            Some(10.0),
            "repeated X must not extend the deadline"
        );
        runtime.frame(0.02);
        assert_eq!(runtime.shell_request, Some(rune::Shell::Quit));
    }
    #[test]
    #[cfg(debug_assertions)]
    fn failed_close_send_and_host_rejection_quit_immediately() {
        let mut runtime = Runtime::new(init(), view, (1440.0, 900.0), Env::new(true, 1.0));
        runtime.update(request_close);
        assert_eq!(runtime.shell_request, Some(rune::Shell::Quit));
        let (mut link, _) =
            host::Link::open(bootstrap::Bootstrap::Scene("core-offline".into())).unwrap();
        let host::Link::Scene(scene) = &mut link else {
            unreachable!()
        };
        scene.close_reply = host::CloseReply::Reject;
        let mut state = init();
        state.link = Some(link);
        let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
        runtime.poll = Some(poll);
        runtime.update(request_close);
        runtime.frame(0.0);
        assert_eq!(runtime.shell_request, Some(rune::Shell::Quit));
    }
    #[test]
    #[cfg(debug_assertions)]
    fn rejected_close_restores_state_and_disarms_the_exit_deadline() {
        let (mut link, _) =
            host::Link::open(bootstrap::Bootstrap::Scene("core-offline".into())).unwrap();
        let host::Link::Scene(scene) = &mut link else {
            unreachable!()
        };
        scene.close_reply = host::CloseReply::Veto;
        let mut state = init();
        state.link = Some(link);
        let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
        runtime.poll = Some(poll);
        runtime.update(request_close);
        runtime.frame(0.0);
        assert!(!runtime.state.closing);
        assert_eq!(runtime.state.close_deadline, None);
        runtime.frame(11.0);
        assert_eq!(runtime.shell_request, None);
        runtime.update(request_close);
        assert!(
            runtime.state.closing,
            "a denied close must permit another attempt"
        );
    }
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
            state.core.access.verified = true;
            state.core.access.tester = true;
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
    #[test]
    fn frame_controls_have_names_and_keyboard_works_at_three_scales() {
        for scale in [1.0, 1.25, 1.5] {
            let mut state = init();
            state.core.access.verified = true;
            state.core.access.tester = true;
            let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, scale));
            runtime.frame(0.0);
            for element in runtime.elements().into_iter().filter(|e| e.focusable) {
                assert!(
                    element
                        .label
                        .as_ref()
                        .is_some_and(|label| !label.is_empty()),
                    "unnamed control {}",
                    element.path
                );
            }
            assert!(!runtime.accessibility_json().is_null());
            runtime.key(rune::KeyEvent {
                key: rune::Key::Tab,
                mods: Default::default(),
            });
            runtime.frame(0.1);
            assert!(
                runtime
                    .elements()
                    .iter()
                    .any(|e| e.key.as_deref() == Some("sidebar-toggle") && e.focused)
            );
            runtime.key(rune::KeyEvent {
                key: rune::Key::Enter,
                mods: Default::default(),
            });
            runtime.frame(0.2);
            assert!(runtime.state.collapsed);
            runtime.repeat_key(rune::KeyEvent {
                key: rune::Key::Enter,
                mods: Default::default(),
            });
            runtime.frame(0.3);
            assert!(runtime.state.collapsed, "held Enter must not toggle twice");
            runtime.key(rune::KeyEvent {
                key: rune::Key::Text(" ".into()),
                mods: Default::default(),
            });
            runtime.frame(0.4);
            assert!(
                !runtime.state.collapsed,
                "Space must retain native activation"
            );
        }
    }
    #[test]
    #[cfg(debug_assertions)]
    fn connected_scene_populates_core_and_read_only_roadmap() {
        use vantare_hub_host::protocol::{Request, UiToHost};
        let (mut link, _) =
            host::Link::open(bootstrap::Bootstrap::Scene("core-connected".into())).unwrap();
        link.send(UiToHost::Request {
            id: 1,
            request: Request::CoreGet {},
        })
        .unwrap();
        let mut state = init();
        state.link = Some(link);
        state.section = "roadmap".into();
        let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
        runtime.poll = Some(poll);
        for frame in 0..4 {
            runtime.frame(f64::from(frame) / 60.0);
        }
        assert!(runtime.state.core.live);
        assert!(runtime.state.roadmap.value.publication.is_some());
        assert!(
            runtime
                .elements()
                .iter()
                .any(|e| e.key.as_deref() == Some("sim-status")
                    && e.text.as_deref() == Some(text("shell.simulatorConnected")))
        );
        assert!(runtime.find("roadmap-lane-next").is_some());
        assert!(
            runtime
                .elements()
                .iter()
                .any(|e| e.text.as_deref() == Some("Rework - Roadmap"))
        );
    }
    #[test]
    fn unavailable_core_removes_privileged_navigation_and_shows_warning() {
        let mut runtime = Runtime::new(init(), view, (1440.0, 900.0), Env::new(true, 1.0));
        runtime.frame(0.0);
        assert!(runtime.find("core-warning").is_some());
        assert!(runtime.find("nav-testing").is_none());
        assert!(runtime.find("nav-calendar").is_none());
        assert!(
            runtime
                .elements()
                .iter()
                .any(|e| e.key.as_deref() == Some("sim-status")
                    && e.text.as_deref() == Some(text("shell.waitingSimulator")))
        );
    }
    #[test]
    fn revoked_access_leaves_the_active_section_but_preserves_allowed_sections() {
        for section in ["testing", "calendar", "roadmap"] {
            for revocation in ["unverified", "blocked", "not-tester"] {
                let mut state = init();
                state.core.access.verified = true;
                state.core.access.tester = true;
                state.section = section.into();
                let mut runtime = Runtime::new(state, view, (1440.0, 900.0), Env::new(true, 1.0));
                runtime.frame(0.0);
                let mut core = runtime.state.core.clone();
                match revocation {
                    "unverified" => core.access.verified = false,
                    "blocked" => core.access.blocked = true,
                    "not-tester" => core.access.tester = false,
                    _ => unreachable!(),
                }
                runtime.update(move |state, _| set_core(state, core));
                runtime.frame(0.1);
                let revoked =
                    section != "roadmap" && (section == "calendar" || revocation != "not-tester");
                assert_eq!(
                    runtime.state.section,
                    if revoked { "home" } else { section },
                    "{section}: {revocation}"
                );
                if revoked {
                    assert!(runtime.find(&format!("nav-{section}")).is_none());
                    assert_eq!(
                        title(&runtime.state),
                        catalog()["navigation"][0]["label"].as_str().unwrap()
                    );
                }
            }
        }
    }
}
