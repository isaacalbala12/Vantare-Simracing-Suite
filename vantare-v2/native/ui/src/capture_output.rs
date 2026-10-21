//! Diagnóstico de las ventanas de captura, separado de Win32/GPU para probarlo.
use crate::overlay::{Hwnd, ffi::Rect};
use std::io::Write;

pub(crate) fn expired_turn(path: &std::path::Path) {
    let _written = writeln!(
        std::io::stdout(),
        "capture-turn expired-marker-removed {}",
        path.display()
    );
}

pub(crate) fn viewport(physical_width: f32, physical_height: f32, width: i32, height: i32) {
    let _written = writeln!(
        std::io::stdout(),
        "capture-viewport physical={physical_width}x{physical_height} expected={width}x{height}"
    );
}

pub(crate) fn created(hwnd: Hwnd) {
    let _written = writeln!(
        std::io::stdout(),
        "capture-created pid={} hwnd={hwnd} visible=false noactivate=true toolwindow=true",
        std::process::id()
    );
}

pub(crate) fn window(hwnd: Hwnd, rect: Rect) {
    let _written = writeln!(
        std::io::stdout(),
        "capture-window pid={} hwnd={hwnd} rect={},{},{},{} focus=false",
        std::process::id(),
        rect.left,
        rect.top,
        rect.right,
        rect.bottom
    );
}

#[cfg(all(test, windows))]
mod tests {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle};
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreatePipe(
            read: *mut RawHandle,
            write: *mut RawHandle,
            attrs: *const std::ffi::c_void,
            size: u32,
        ) -> i32;
        fn SetStdHandle(kind: u32, handle: RawHandle) -> i32;
    }

    #[test]
    fn window_diagnostics_survive_a_closed_stdout_without_gpu() {
        const CHILD: &str = "VANTARE_TEST_CAPTURE_WINDOW_OUTPUT";
        if let Ok(kind) = std::env::var(CHILD) {
            let mut read = std::ptr::null_mut();
            let mut write = std::ptr::null_mut();
            // SAFETY: valid output pointers; no security attributes, default size.
            assert_ne!(
                unsafe { CreatePipe(&raw mut read, &raw mut write, std::ptr::null(), 0) },
                0
            );
            // SAFETY: handles are newly created, distinct and exclusively owned.
            let (read, write) = unsafe {
                (
                    OwnedHandle::from_raw_handle(read),
                    OwnedHandle::from_raw_handle(write),
                )
            };
            drop(read);
            // SAFETY: only this isolated test child changes its standard handle.
            // Keep the write end alive; libtest startup output has already finished.
            assert_ne!(
                unsafe { SetStdHandle((-11_i32).cast_unsigned(), write.as_raw_handle()) },
                0
            );
            match kind.as_str() {
                "turn" => super::expired_turn(std::path::Path::new("fixture.marker")),
                "viewport" => super::viewport(1440.0, 900.0, 1440, 900),
                "created" => super::created(1),
                "window" => super::window(
                    1,
                    super::Rect {
                        left: -4000,
                        top: 0,
                        right: -2560,
                        bottom: 900,
                    },
                ),
                _ => panic!("unknown diagnostic"),
            }
            std::process::exit(0);
        }
        for kind in ["viewport", "created", "window", "turn"] {
            let output = Command::new(std::env::current_exe().expect("test binary"))
                .args([
                    "--exact",
                    "capture_output::tests::window_diagnostics_survive_a_closed_stdout_without_gpu",
                    "--nocapture",
                ])
                .env(CHILD, kind)
                .creation_flags(0x0800_0000)
                .output()
                .expect("diagnostic child");
            assert!(
                output.status.success(),
                "{kind}: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}
