//! Registro estándar de clientes Internet; nunca se ejecuta su línea de comandos.
#![allow(unsafe_code)]
use crate::{Error, Result};
use std::{io::Write, path::PathBuf, process::Command};
use windows_sys::Win32::{
    Foundation::{ERROR_MORE_DATA, ERROR_SUCCESS, LocalFree},
    System::Registry::{
        HKEY, HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY,
        KEY_WOW64_64KEY, RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ, RegCloseKey, RegEnumKeyExW,
        RegGetValueW, RegOpenKeyExW,
    },
    UI::Shell::CommandLineToArgvW,
};

struct Key(HKEY);
impl Drop for Key {
    fn drop(&mut self) {
        // SAFETY: solo contiene handles abiertos propios, nunca un pseudo-HKEY.
        unsafe { RegCloseKey(self.0) };
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

fn key(root: HKEY, path: &str, view: u32) -> Option<Key> {
    let path = wide(path);
    let mut handle = std::ptr::null_mut();
    // SAFETY: nombre terminado y salida válida. Solo lectura.
    let status = unsafe { RegOpenKeyExW(root, path.as_ptr(), 0, KEY_READ | view, &raw mut handle) };
    if status == ERROR_SUCCESS {
        Some(Key(handle))
    } else {
        None
    }
}

pub(super) fn association_exists(progid: &str) -> bool {
    key(HKEY_CLASSES_ROOT, progid, 0).is_some()
}

fn command(parent: &Key, child: &str) -> Option<String> {
    let path = wide(&format!(r"{child}\shell\open\command"));
    let mut buffer = vec![0_u16; 32768];
    let mut size = 65536;
    // SAFETY: HKEY vivo, buffer de size bytes. Solo SZ/EXPAND_SZ; Windows expande
    // variables sin ejecutar programas. El valor sin nombre es el comando.
    let status = unsafe {
        RegGetValueW(
            parent.0,
            path.as_ptr(),
            std::ptr::null(),
            RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &raw mut size,
        )
    };
    if status != ERROR_SUCCESS || !(2..=65536).contains(&size) || size % 2 != 0 {
        return None;
    }
    let end = buffer.iter().position(|ch| *ch == 0)?;
    String::from_utf16(&buffer[..end]).ok()
}

fn executable(command: &str) -> Option<PathBuf> {
    if command.trim().is_empty() || command.contains('\0') || command.len() > 32768 {
        return None;
    }
    let command = wide(command.trim());
    let mut count = 0;
    // SAFETY: entrada terminada. Windows asigna el vector completo; se libera
    // una sola vez con LocalFree, después de copiar únicamente argv[0].
    let args = unsafe { CommandLineToArgvW(command.as_ptr(), &raw mut count) };
    if args.is_null() {
        return None;
    }
    let result = (|| {
        if count < 1 {
            return None;
        }
        let first = unsafe { *args };
        let length = (0..32768).find(|index| unsafe { *first.add(*index) } == 0)?;
        let text = String::from_utf16(unsafe { std::slice::from_raw_parts(first, length) }).ok()?;
        let path = PathBuf::from(text);
        let name = path.file_name()?.to_str()?.to_ascii_lowercase();
        if !path.is_absolute()
            || !path.extension()?.to_str()?.eq_ignore_ascii_case("exe")
            || [
                "cmd.exe",
                "powershell.exe",
                "pwsh.exe",
                "wscript.exe",
                "cscript.exe",
                "rundll32.exe",
                "explorer.exe",
                "openwith.exe",
                "mshta.exe",
            ]
            .contains(&name.as_str())
        {
            return None;
        }
        Some(path)
    })();
    unsafe { LocalFree(args.cast()) };
    result
}

fn priority(name: &str) -> u8 {
    let name = name.to_ascii_lowercase();
    for (rank, brand) in ["chrome", "edge", "firefox", "brave", "opera"]
        .iter()
        .enumerate()
    {
        if name.contains(brand) {
            return u8::try_from(rank).unwrap_or(5);
        }
    }
    5
}

struct Browser {
    name: String,
    executable: PathBuf,
    hive: u8,
}

fn registered() -> Vec<Browser> {
    let mut found = Vec::new();
    for (hive, root) in [(0, HKEY_CURRENT_USER), (1, HKEY_LOCAL_MACHINE)] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let Some(parent) = key(root, r"SOFTWARE\Clients\StartMenuInternet", view) else {
                continue;
            };
            // El registro no puede producir un recorrido ilimitado.
            for index in 0..4096 {
                let mut name = [0_u16; 256];
                let mut length = 256;
                let status = unsafe {
                    RegEnumKeyExW(
                        parent.0,
                        index,
                        name.as_mut_ptr(),
                        &raw mut length,
                        std::ptr::null(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                    )
                };
                if status == ERROR_MORE_DATA {
                    continue;
                }
                if status != ERROR_SUCCESS {
                    break;
                }
                let Ok(length) = usize::try_from(length) else {
                    continue;
                };
                let Ok(name) = String::from_utf16(&name[..length]) else {
                    continue;
                };
                let Some(executable) = command(&parent, &name).and_then(|line| executable(&line))
                else {
                    continue;
                };
                if executable.is_file()
                    && !found
                        .iter()
                        .any(|browser: &Browser| browser.executable == executable)
                {
                    found.push(Browser {
                        name,
                        executable,
                        hive,
                    });
                }
            }
        }
    }
    // Preferencia del usuario antes que la máquina; orden estable por marca.
    found.sort_by_key(|browser| {
        (
            browser.hive,
            priority(&browser.name),
            browser.name.to_ascii_lowercase(),
        )
    });
    found
}

fn launch_command(executable: &std::path::Path, url: &url::Url, breakaway: bool) -> Command {
    use std::os::windows::process::CommandExt;
    let mut command = Command::new(executable);
    // El supervisor permite breakaway: el navegador pertenece al usuario y no
    // debe morir con el Job de Vantare. No se cambia la política de ese Job.
    if breakaway {
        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_BREAKAWAY_FROM_JOB);
    }
    // Command::arg usa el quoting Win32 estándar. No raw_arg, sustitución de %1,
    // flags del registro, PATH, cmd ni ShellExecute en el fallback.
    command
        .arg(url.as_str())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    command
}

fn try_registered(browsers: Vec<Browser>, mut launch: impl FnMut(&Browser) -> bool) -> Result<()> {
    for browser in browsers {
        if launch(&browser) {
            // El nombre viene del registro: evitar líneas inyectadas y rutas/URL.
            let name: String = browser
                .name
                .chars()
                .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
                .take(96)
                .collect();
            let _log = writeln!(std::io::stderr(), "account-login: fallback-browser={name}");
            return Ok(());
        }
    }
    let _log = writeln!(
        std::io::stderr(),
        "account-login: no-browser; manual-link-available"
    );
    Err(Error::BrowserUnavailable)
}

fn spawn_with_breakaway_retry(
    mut spawn: impl FnMut(bool) -> std::io::Result<()>,
) -> std::io::Result<()> {
    match spawn(true) {
        Err(error) if error.raw_os_error() == Some(5) => {
            let _log = writeln!(
                std::io::stderr(),
                "account-login: breakaway-denied; retry-with-inherited-job"
            );
            let result = spawn(false);
            if result.is_ok() {
                let _log = writeln!(std::io::stderr(), "account-login: browser-inherited-job");
            }
            result
        }
        result => result,
    }
}

pub(super) fn open(url: &url::Url) -> Result<()> {
    try_registered(registered(), |browser| {
        match spawn_with_breakaway_retry(|breakaway| {
            launch_command(&browser.executable, url, breakaway)
                .spawn()
                .map(|_| ())
        }) {
            Ok(()) => true,
            Err(error) => {
                let _log = writeln!(
                    std::io::stderr(),
                    "account-login: fallback-launch-failed; os-code={:?}",
                    error.raw_os_error()
                );
                false
            }
        }
    })
}

#[cfg(test)]
mod private_qa;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registration_is_only_an_executable_not_a_shell_command() {
        assert_eq!(
            executable(r#""C:\Program Files\Google\Chrome\chrome.exe" -- "%1""#),
            Some(PathBuf::from(r"C:\Program Files\Google\Chrome\chrome.exe"))
        );
        for invalid in [
            "",
            r"chrome.exe",
            r"C:\browser.cmd",
            r#""C:\Windows\System32\cmd.exe" /c chrome"#,
            r#""C:\Windows\System32\OpenWith.exe" "%1""#,
        ] {
            assert!(executable(invalid).is_none());
        }
    }

    #[test]
    fn broken_default_uses_registered_chrome_and_valid_default_never_discovers_others() {
        let mut chosen = None;
        let chrome = Browser {
            name: "Google Chrome".into(),
            executable: PathBuf::from(r"C:\Chrome\chrome.exe"),
            hive: 1,
        };
        super::super::with_fallback(
            || Err(Error::BrowserUnavailable),
            || {
                try_registered(vec![chrome], |browser| {
                    chosen = Some(browser.name.clone());
                    true
                })
            },
        )
        .expect("registered Chrome accepted");
        assert_eq!(chosen.as_deref(), Some("Google Chrome"));
        super::super::with_fallback(|| Ok(()), || panic!("working default must be respected"))
            .expect("default");
        assert_eq!(
            super::super::with_fallback(
                || Err(Error::BrowserUnavailable),
                || try_registered(vec![], |_| panic!("no browser"))
            ),
            Err(Error::BrowserUnavailable)
        );
    }

    #[test]
    fn special_oauth_characters_are_one_literal_argument_without_registry_flags() {
        let url = url::Url::parse("https://issuer.invalid/authorize?state=a&redirect_uri=http%3A%2F%2F127.0.0.1%3A1234%2F&extra=%22a%20b%22%5C%26%7C%3E%25").expect("url");
        let command = launch_command(
            std::path::Path::new(r"C:\Program Files\Chrome\chrome.exe"),
            &url,
            true,
        );
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(args, [std::ffi::OsStr::new(url.as_str())]);
        assert_eq!(
            command.get_program(),
            std::ffi::OsStr::new(r"C:\Program Files\Chrome\chrome.exe")
        );
    }

    #[test]
    fn registered_browser_order_is_chrome_edge_firefox_brave_opera_then_rest() {
        let mut names = [
            "Other",
            "OperaStable",
            "Brave",
            "Firefox",
            "Microsoft Edge",
            "Google Chrome",
        ];
        names.sort_by_key(|name| priority(name));
        assert_eq!(
            names,
            [
                "Google Chrome",
                "Microsoft Edge",
                "Firefox",
                "Brave",
                "OperaStable",
                "Other"
            ]
        );
    }

    #[test]
    fn denied_breakaway_retries_once_without_it_and_preserves_other_results() {
        for (errors, expected) in [
            ([Some(5), None], vec![true, false]),
            ([Some(5), Some(5)], vec![true, false]),
            ([Some(2), None], vec![true]),
            ([None, None], vec![true]),
        ] {
            let mut attempts = Vec::new();
            let result = spawn_with_breakaway_retry(|breakaway| {
                let error = errors[attempts.len()];
                attempts.push(breakaway);
                error.map_or(Ok(()), |code| Err(std::io::Error::from_raw_os_error(code)))
            });
            assert_eq!(attempts, expected);
            let last_error = errors[attempts.len() - 1];
            assert_eq!(
                result.err().and_then(|error| error.raw_os_error()),
                last_error
            );
        }
    }
}
