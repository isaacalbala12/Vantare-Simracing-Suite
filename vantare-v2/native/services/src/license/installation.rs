#[cfg(any(not(windows), test))]
use crate::Error;
use crate::Result;

#[cfg(windows)]
#[allow(unsafe_code)]
mod windows;

pub fn legacy_fingerprint() -> Result<String> {
    #[cfg(windows)]
    {
        windows::fingerprint()
    }
    #[cfg(not(windows))]
    {
        unsupported_legacy_binding()
    }
}

#[cfg(any(not(windows), test))]
fn unsupported_legacy_binding() -> Result<String> {
    // HOME|GOOS colisiona entre máquinas. No acuñar otra huella sin migración.
    Err(Error::Unsupported)
}

#[cfg(test)]
#[test]
fn regression_1542_unix_legacy_binding_is_unsupported() {
    assert_eq!(unsupported_legacy_binding(), Err(Error::Unsupported));
}
