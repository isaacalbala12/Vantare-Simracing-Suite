//! Testing Center exclusivamente local. El texto privado nunca cruza el exportador.
pub(super) mod diagnostic;
mod store;
mod view;
use crate::launcher::input;
#[cfg(windows)]
#[allow(unsafe_code)] // Única frontera: SHA-256 del proveedor Win32 BCrypt.
mod windows;

pub use view::Testing;

#[cfg(test)]
mod tests;

mod editor;
pub use editor::{Editor, empty_fields};
