//! El SO debe aceptar la apertura, no basta con crear un proceso intermediario.
use crate::{Error, Result};

pub(crate) fn begin(
    account: &mut crate::account::Account,
    open: impl FnOnce(&url::Url) -> Result<()>,
) -> Result<()> {
    use std::io::Write;
    let url = account.begin_login()?;
    let _log = writeln!(std::io::stderr(), "account-login: browser-request");
    if let Err(error) = open(&url) {
        account.cancel_login()?;
        return Err(error);
    }

    let _log = writeln!(
        std::io::stderr(),
        "account-login: browser-accepted; awaiting-callback"
    );
    Ok(())
}

#[cfg(any(windows, test))]
fn is_browser_association(progid: &str) -> bool {
    !progid.trim().is_empty()
        && !["Unknown", "Undecided", "Applications\\OpenWith.exe"]
            .iter()
            .any(|fallback| progid.eq_ignore_ascii_case(fallback))
}

#[cfg(windows)]
#[allow(unsafe_code)]
fn handler_available(scheme: &str) -> bool {
    use std::io::Write;
    use windows_sys::Win32::{
        Foundation::{S_FALSE, S_OK},
        UI::Shell::{
            ASSOCF_INIT_IGNOREUNKNOWN, ASSOCF_IS_PROTOCOL, ASSOCF_NOFIXUPS, ASSOCF_VERIFY,
            ASSOCSTR_PROGID, AssocQueryStringW,
        },
    };
    let scheme: Vec<u16> = scheme.encode_utf16().chain(Some(0)).collect();
    let flags = ASSOCF_IS_PROTOCOL | ASSOCF_VERIFY | ASSOCF_NOFIXUPS | ASSOCF_INIT_IGNOREUNKNOWN;
    let mut length = 0;
    // Solo consulta: no activa programas ni corrige el registro del usuario.
    let status = unsafe {
        AssocQueryStringW(
            flags,
            ASSOCSTR_PROGID,
            scheme.as_ptr(),
            windows_sys::w!("open"),
            std::ptr::null_mut(),
            &raw mut length,
        )
    };
    if status != S_FALSE || !(2..=32768).contains(&length) {
        let _log = writeln!(
            std::io::stderr(),
            "account-login: association-unavailable hresult={status}"
        );
        return false;
    }
    let Ok(capacity) = usize::try_from(length) else {
        return false;
    };
    let mut association = vec![0; capacity];
    let status = unsafe {
        AssocQueryStringW(
            flags,
            ASSOCSTR_PROGID,
            scheme.as_ptr(),
            windows_sys::w!("open"),
            association.as_mut_ptr(),
            &raw mut length,
        )
    };
    let Ok(length) = usize::try_from(length) else {
        return false;
    };
    if status != S_OK || length < 2 || length > association.len() {
        let _log = writeln!(
            std::io::stderr(),
            "account-login: association-unavailable hresult={status}"
        );
        return false;
    }
    let Ok(progid) = String::from_utf16(&association[..length - 1]) else {
        return false;
    };
    // "Undecided" activa OpenWith aunque ShellExecuteEx devuelva éxito.
    // Se valida el ProgID (también apps delegadas), no una ruta .exe obligatoria.
    let available = is_browser_association(&progid);
    if !available {
        let _log = writeln!(std::io::stderr(), "account-login: association-undecided");
    }
    available
}

#[cfg(windows)]
#[allow(unsafe_code)]
pub(crate) fn open(url: &url::Url) -> Result<()> {
    use std::io::Write;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::Com::{
        COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, CoInitializeEx, CoUninitialize,
    };
    use windows_sys::Win32::UI::{
        Shell::{SEE_MASK_FLAG_NO_UI, SHELLEXECUTEINFOW, ShellExecuteExW},
        WindowsAndMessaging::SW_SHOWNORMAL,
    };
    // Shell puede activar extensiones COM. El worker no tiene message loop.
    // Un apartamento ya inicializado se conserva; solo equilibramos nuestro S_OK/S_FALSE.
    let com_flags = u32::try_from(COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)
        .map_err(|_| Error::BrowserUnavailable)?;
    let size = u32::try_from(std::mem::size_of::<SHELLEXECUTEINFOW>())
        .map_err(|_| Error::BrowserUnavailable)?;
    let com = unsafe { CoInitializeEx(std::ptr::null(), com_flags) };
    if com < 0 && com != windows_sys::Win32::Foundation::RPC_E_CHANGED_MODE {
        return Err(Error::BrowserUnavailable);
    }

    let result = (|| {
        if !handler_available(url.scheme()) {
            return Err(Error::BrowserUnavailable);
        }
        let target: Vec<u16> = std::ffi::OsStr::new(url.as_str())
            .encode_wide()
            .chain(Some(0))
            .collect();
        // Sin ASYNCOK: se comprueba la aceptación del Shell desde el worker IPC.
        // NO_UI evita un diálogo de error en lugar del mensaje accionable del Hub.
        let mut info = SHELLEXECUTEINFOW {
            cbSize: size,
            fMask: SEE_MASK_FLAG_NO_UI,
            lpVerb: windows_sys::w!("open"),
            lpFile: target.as_ptr(),
            nShow: SW_SHOWNORMAL,
            ..unsafe { std::mem::zeroed() }
        };
        // SAFETY: estructura inicializada, cadenas terminadas y vivas durante la llamada.
        let accepted = unsafe { ShellExecuteExW(&raw mut info) } != 0;
        let error_code = if accepted {
            0
        } else {
            std::io::Error::last_os_error()
                .raw_os_error()
                .unwrap_or_default()
        };
        if accepted {
            Ok(())
        } else {
            let _log = writeln!(
                std::io::stderr(),
                "account-login: shell-rejected win32={error_code}"
            );
            Err(Error::BrowserUnavailable)
        }
    })();
    if com >= 0 {
        unsafe { CoUninitialize() };
    }
    result
}

#[cfg(not(windows))]
pub(crate) fn open(url: &url::Url) -> Result<()> {
    #[cfg(target_os = "linux")]
    let executable = "xdg-open";
    #[cfg(target_os = "macos")]
    let executable = "open";
    // Conserva la apertura asíncrona existente fuera de Windows: algunos
    // abridores viven hasta que se cierra el navegador.
    std::process::Command::new(executable)
        .arg(url.as_str())
        .spawn()
        .map(|_| ())
        .map_err(|_| Error::BrowserUnavailable)
}

#[cfg(test)]
mod tests {
    #[test]
    fn windows_picker_is_unavailable_but_delegated_browser_associations_remain_valid() {
        for picker in [
            "",
            "Unknown",
            "Undecided",
            "undecided",
            "Applications\\OpenWith.exe",
        ] {
            assert!(
                !super::is_browser_association(picker),
                "not a browser: {picker}"
            );
        }
        for browser in ["MSEdgeHTM", "FirefoxURL-fixture", "AppXBrowserFixture"] {
            assert!(
                super::is_browser_association(browser),
                "valid browser association: {browser}"
            );
        }
    }

    #[cfg(windows)]
    #[test]
    fn unregistered_protocol_is_rejected_before_windows_activation() {
        let url = url::Url::parse(&format!(
            "vantare-qa-{}://unregistered",
            crate::random_id().expect("unique unregistered protocol")
        ))
        .expect("url");
        assert_eq!(super::open(&url), Err(crate::Error::BrowserUnavailable));
    }

    #[test]
    fn rejected_browser_releases_callback_and_an_explicit_retry_starts_fresh() {
        use super::*;
        let server = crate::test_http::Server::start(vec![]);
        let (root, store) = crate::test_store("browser-failed");
        let mut account = crate::account::fixture(&server.base, &store);
        let mut port = 0;
        let result = begin(&mut account, |url| {
            let redirect = url
                .query_pairs()
                .find(|(key, _)| key == "redirect_uri")
                .expect("redirect")
                .1;
            port = url::Url::parse(&redirect)
                .expect("loopback")
                .port()
                .expect("port");
            assert!(std::net::TcpListener::bind(("127.0.0.1", port)).is_err());
            Err(Error::BrowserUnavailable)
        });
        assert_eq!(result, Err(Error::BrowserUnavailable));
        assert!(!account.login_pending());
        let listener = std::net::TcpListener::bind(("127.0.0.1", port))
            .expect("failed attempt closed its listener");
        drop(listener);
        begin(&mut account, |_| Ok(())).expect("explicit retry accepted");
        assert!(account.login_pending());
        drop(account);
        drop(store);
        crate::cleanup_store(&root, "browser-failed", &[]);
        server.finish();
    }
}
