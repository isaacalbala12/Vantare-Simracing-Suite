//! Testing Center: envío de texto revisado y diagnóstico local separado.
pub(super) mod diagnostic;
mod store;
mod view;
#[cfg(windows)]
#[allow(unsafe_code)] // Única frontera: SHA-256 del proveedor Win32 BCrypt.
mod windows;

pub use view::Testing;

#[cfg(test)]
mod tests;

mod editor;
mod model;
pub use editor::{Editor, empty_fields};
