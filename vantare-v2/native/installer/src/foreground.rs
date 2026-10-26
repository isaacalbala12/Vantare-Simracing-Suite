//! Pass the installer's user-initiated foreground permission to the bootstrap,
//! which starts the supervisor and Hub through PowerShell (same policy as #1758).
#![allow(unsafe_code)]

#[link(name = "user32")]
unsafe extern "system" {
    fn AllowSetForegroundWindow(process_id: u32) -> i32;
}

pub(super) fn allow_interactive_launch() {
    // SAFETY: ASFW_ANY is a DWORD constant; this call has no pointer arguments.
    // Windows retains its foreground policy if the grant is refused. Called
    // only for the explicit Open action, never during capture or silent setup.
    let _ = unsafe { AllowSetForegroundWindow(u32::MAX) };
}
