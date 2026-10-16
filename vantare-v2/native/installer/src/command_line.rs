//! Read only this process's OS-owned command line before starting UI/workers.
//! `std::env::args_os` loses separators between unquoted NSIS /D path fragments.
#![allow(unsafe_code)]

use std::{ffi::OsString, os::windows::ffi::OsStringExt, path::PathBuf};

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCommandLineW() -> *const u16;
}

pub(super) fn unquoted_root() -> Result<Option<PathBuf>, String> {
    // SAFETY: zero-argument Win32 system ABI. Windows owns a process-lifetime,
    // aligned, NUL-terminated UTF-16 buffer. We neither free nor modify it.
    let pointer = unsafe { GetCommandLineW() };
    if pointer.is_null() {
        return Err("Windows no proporcionó la línea de comandos".into());
    }
    let mut wide = Vec::new();
    for index in 0..32_768 {
        // SAFETY: Win32 command lines have at most 32767 UTF-16 units plus NUL;
        // we copy each initialized unit and stop at the terminator. No installer
        // thread has started and no code in this crate writes the OS buffer.
        let unit = unsafe { *pointer.add(index) };
        if unit == 0 {
            let line = OsString::from_wide(&wide)
                .into_string()
                .map_err(|_| "Argumento no Unicode")?;
            return Ok(directory_suffix(&line).map(PathBuf::from));
        }
        wide.push(unit);
    }
    Err("Línea de comandos de Windows demasiado grande".into())
}

fn directory_suffix(line: &str) -> Option<&str> {
    let mut quoted = false;
    let mut boundary = true;
    for (index, character) in line.char_indices() {
        if boundary
            && !quoted
            && (line[index..].starts_with("/D=") || line[index..].starts_with("_?="))
        {
            let suffix = &line[index + 3..];
            // Quoted forms are already lossless in args_os; only replace the
            // NSIS unquoted suffix, after Args::parse has rejected extra flags.
            return (!suffix.contains('"')).then_some(suffix);
        }
        if character == '"' {
            quoted = !quoted;
        }
        boundary = !quoted && character.is_whitespace();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::directory_suffix;

    #[test]
    fn raw_nsis_suffix_keeps_double_spaces_and_unicode() {
        assert_eq!(
            directory_suffix(r#""C:\Mi Setup.exe" /S /D=C:\QA  instalación\Vantare"#),
            Some(r"C:\QA  instalación\Vantare")
        );
        assert_eq!(
            directory_suffix(r"Uninstall.exe /S _?=C:\QA  instalación"),
            Some(r"C:\QA  instalación")
        );
    }

    #[test]
    fn quoted_directory_uses_the_lossless_os_argument() {
        assert_eq!(
            directory_suffix(r#"Setup.exe /S "/D=C:\QA  instalación""#),
            None
        );
        assert_eq!(
            directory_suffix(r#"Setup.exe /D="C:\QA  instalación""#),
            None
        );
    }
}
