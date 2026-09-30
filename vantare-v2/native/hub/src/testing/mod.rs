//! Testing Center exclusivamente local. El texto privado nunca cruza el exportador.
pub(super) mod diagnostic;
mod store;
mod view;
// Reutilización del campo Orbit/IME existente sin editar una sección de otro worker.
// El orquestador puede hacer público el módulo común y sustituir esta ruta.
#[path = "../launcher/input.rs"]
#[expect(
    clippy::duplicate_mod,
    reason = "Reutilizar el campo privado Orbit/IME sin editar la sección ajena; el orquestador lo hará público"
)]
mod input;
#[cfg(windows)]
#[allow(unsafe_code)] // Única frontera: SHA-256 del proveedor Win32 BCrypt.
mod windows;

pub use view::Testing;

#[cfg(test)]
mod tests;
