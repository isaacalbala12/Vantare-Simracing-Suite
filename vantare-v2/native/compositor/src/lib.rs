//! Prueba #2022 (VANTA-140): compositor propio para overlays.
//!
//! - [`receta`]: formato declarativo del diseño (JSON), sistema de diseño
//!   (tokens) y su validación estricta. Puro, compila en cualquier plataforma.
//! - [`escena`]: receta + sistema + modelo → árbol de capas, maquetación
//!   (taffy), estados y animaciones; produce [`escena::capas::Lote`]. Puro.
//! - `plataforma` (solo Windows): ventana de overlay, `DirectComposition`,
//!   Direct2D/DirectWrite, reloj del compositor, captura y recarga en caliente.
//!
//! El overlay no tiene lógica: el núcleo entrega un modelo ya calculado.

pub mod escena;
pub mod receta;

#[cfg(windows)]
pub mod plataforma;
