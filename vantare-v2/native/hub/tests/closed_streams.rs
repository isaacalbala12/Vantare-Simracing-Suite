#![cfg(windows)]

use std::os::windows::io::{FromRawHandle, OwnedHandle, RawHandle};
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};

fn closed_reader() -> Stdio {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreatePipe(
            read: *mut RawHandle,
            write: *mut RawHandle,
            attrs: *const std::ffi::c_void,
            size: u32,
        ) -> i32;
    }
    let mut read = std::ptr::null_mut();
    let mut write = std::ptr::null_mut();
    // SAFETY: valid output pointers; null security attributes and default size.
    assert_ne!(
        unsafe { CreatePipe(&raw mut read, &raw mut write, std::ptr::null(), 0) },
        0
    );
    // SAFETY: both handles were just created, are distinct and exclusively owned.
    let (read, write) = unsafe {
        (
            OwnedHandle::from_raw_handle(read),
            OwnedHandle::from_raw_handle(write),
        )
    };
    drop(read);
    Stdio::from(write)
}

#[test]
fn invalid_hub_cli_preserves_exit_code_when_stderr_is_closed() {
    let status = Command::new(env!("CARGO_BIN_EXE_vantare-hub"))
        .arg("--invalid-option")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(closed_reader())
        .creation_flags(0x0800_0000)
        .status()
        .expect("invalid Hub CLI");
    assert_eq!(status.code(), Some(2));
}

#[cfg(feature = "parity-capture")]
#[test]
fn capture_batch_completes_with_its_stdout_reader_closed() {
    const CHILD: &str = "VANTARE_TEST_CLOSED_CAPTURE_STDOUT";
    if std::env::var_os(CHILD).is_some() {
        // An empty prepared batch never opens GPUI/GPU, but emits the same
        // progress/completion output as a fully cached batch.
        vantare_hub::capture::run_many(Vec::new()).expect("headless batch");
        std::process::exit(0);
    }
    let output = Command::new(std::env::current_exe().expect("test binary"))
        .args([
            "--exact",
            "capture_batch_completes_with_its_stdout_reader_closed",
            "--nocapture",
        ])
        .env(CHILD, "1")
        .stdin(Stdio::null())
        .stdout(closed_reader())
        .creation_flags(0x0800_0000)
        .output()
        .expect("batch child");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
