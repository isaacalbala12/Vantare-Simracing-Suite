use serde::Deserialize;
use slint::{ComponentHandle, ModelRc, SharedString, Timer, TimerMode, VecModel};
use std::{env, fs, path::PathBuf, rc::Rc, time::Duration};

slint::include_modules!();

#[derive(Deserialize)]
struct Fixture {
    scene: Scene,
}
#[derive(Deserialize)]
struct Scene {
    rows: Vec<FixtureRow>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureRow {
    position: i32,
    driver: String,
    vehicle_class: String,
    gap_seconds: f64,
    pit: bool,
    player: bool,
}

#[derive(Default)]
struct Options {
    overlay: bool,
    hide_gap: bool,
    validate_only: bool,
    auto_close_ms: u64,
}

fn parse_options() -> Result<Options, String> {
    let mut result = Options::default();
    let args: Vec<String> = env::args().skip(1).collect();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--mode" => {
                index += 1;
                let mode = args.get(index).ok_or("--mode requires a value")?;
                result.overlay = match mode.as_str() {
                    "overlay" => true,
                    "control" => false,
                    _ => return Err(format!("unsupported mode {mode}")),
                };
            }
            "--hide-gap" => result.hide_gap = true,
            "--validate-only" => result.validate_only = true,
            "--auto-close-ms" => {
                index += 1;
                result.auto_close_ms = args
                    .get(index)
                    .ok_or("--auto-close-ms requires a value")?
                    .parse()
                    .map_err(|_| "invalid --auto-close-ms")?;
            }
            "--help" | "-h" => {
                println!(
                    "vantare-slint-bakeoff [--mode control|overlay] [--hide-gap] [--validate-only] [--auto-close-ms N]"
                );
                std::process::exit(0);
            }
            other => return Err(format!("unknown argument {other}")),
        }
        index += 1;
    }
    Ok(result)
}

fn fixture_path() -> Result<PathBuf, String> {
    let executable = env::current_exe().map_err(|error| format!("resolve executable: {error}"))?;
    Ok(executable
        .parent()
        .ok_or("executable has no parent")?
        .join("fixture.json"))
}

fn load_rows() -> Result<Vec<DriverRow>, String> {
    let path = fixture_path()?;
    let bytes = fs::read(&path).map_err(|error| format!("read {}: {error}", path.display()))?;
    let fixture: Fixture =
        serde_json::from_slice(&bytes).map_err(|error| format!("parse fixture: {error}"))?;
    if fixture.scene.rows.len() != 8 {
        return Err("fixture must contain exactly 8 rows".into());
    }
    Ok(fixture
        .scene
        .rows
        .into_iter()
        .map(|row| DriverRow {
            position: row.position,
            driver: SharedString::from(row.driver),
            vehicle_class: SharedString::from(row.vehicle_class.replace("_ELMS", "")),
            gap: SharedString::from(format!("{:.3}", row.gap_seconds)),
            pit: row.pit,
            player: row.player,
        })
        .collect())
}

#[cfg(windows)]
fn configure_overlay_window() {
    use std::{thread, time::Instant};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GWL_EXSTYLE, GetWindowLongPtrW, GetWindowThreadProcessId, HWND_TOPMOST,
        IsWindowVisible, SW_SHOWNOACTIVATE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_SHOWWINDOW, SetWindowLongPtrW, SetWindowPos, ShowWindow, WS_EX_APPWINDOW,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    };

    struct Search {
        process_id: u32,
        window: windows_sys::Win32::Foundation::HWND,
    }
    unsafe extern "system" fn find_process_window(
        hwnd: windows_sys::Win32::Foundation::HWND,
        parameter: windows_sys::Win32::Foundation::LPARAM,
    ) -> i32 {
        let search = unsafe { &mut *(parameter as *mut Search) };
        let mut process_id = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut process_id) };
        if process_id == search.process_id && unsafe { IsWindowVisible(hwnd) } != 0 {
            search.window = hwnd;
            return 0;
        }
        1
    }

    thread::spawn(move || unsafe {
        let started = Instant::now();
        loop {
            let mut search = Search {
                process_id: std::process::id(),
                window: std::ptr::null_mut(),
            };
            EnumWindows(
                Some(find_process_window),
                &mut search as *mut Search as isize,
            );
            let hwnd = search.window;
            if !hwnd.is_null() {
                let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                SetWindowLongPtrW(
                    hwnd,
                    GWL_EXSTYLE,
                    (style
                        | WS_EX_NOACTIVATE as isize
                        | WS_EX_TRANSPARENT as isize
                        | WS_EX_APPWINDOW as isize)
                        & !(WS_EX_TOOLWINDOW as isize),
                );
                SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
                );
                ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                break;
            }
            if started.elapsed() > Duration::from_secs(5) {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
    });
}

fn run() -> Result<(), String> {
    let options = parse_options()?;
    let rows = load_rows()?;
    if options.validate_only {
        return Ok(());
    }
    let ui = MainWindow::new().map_err(|error| format!("create UI: {error}"))?;
    ui.set_overlay_mode(options.overlay);
    ui.set_show_gap(!options.hide_gap);
    ui.set_rows(ModelRc::from(Rc::new(VecModel::from(rows))));
    if options.overlay {
        configure_overlay_window();
    }

    let pulse_timer = Timer::default();
    let weak = ui.as_weak();
    pulse_timer.start(TimerMode::Repeated, Duration::from_millis(50), move || {
        if let Some(ui) = weak.upgrade() {
            if ui.window().is_visible() {
                ui.set_tick((ui.get_tick() + 1) % 1000);
            }
        }
    });
    let close_timer = Timer::default();
    if options.auto_close_ms > 0 {
        let weak = ui.as_weak();
        close_timer.start(
            TimerMode::SingleShot,
            Duration::from_millis(options.auto_close_ms),
            move || {
                if let Some(ui) = weak.upgrade() {
                    let _ = ui.hide();
                }
                slint::quit_event_loop().ok();
            },
        );
    }
    ui.run().map_err(|error| format!("run UI: {error}"))?;
    drop((pulse_timer, close_timer));
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(2);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn option_defaults_are_control_with_gap() {
        let options = Options::default();
        assert!(!options.overlay && !options.hide_gap);
    }
}
