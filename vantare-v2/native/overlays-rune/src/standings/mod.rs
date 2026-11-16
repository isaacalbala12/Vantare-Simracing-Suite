//! Port literal de la geometría GPUI. El constructor se conecta en A2.
// A1 valida estas funciones solo en tests; A2 las consume en producción.
#[allow(dead_code)] // Temporal: A2 conecta el pintor y retira este permiso.
mod layout;
#[cfg(test)]
mod tests;

#[cfg(test)]
mod painting_tests;
