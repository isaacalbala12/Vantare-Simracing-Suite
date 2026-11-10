//! Contrato entre la parte pura (receta + modelo → capas) y la plataforma
//! (capas → DirectComposition/Direct2D). Es la única frontera: la plataforma
//! no conoce recetas ni modelos, y la parte pura no conoce Windows.
//!
//! Unidades: píxeles lógicos (DIP) con origen arriba a la izquierda del
//! padre; tiempos en segundos del reloj del compositor (`Instante`).
//! Colores en RGBA lineal *no* premultiplicado, 0..=1 (sRGB codificado, como CSS).

use serde::{Deserialize, Serialize};

/// Identidad estable de una capa durante toda la vida de la escena.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct CapaId(pub u32);

/// Segundos del reloj del compositor (misma base que `GetFrameStatistics`).
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd, Serialize, Deserialize)]
pub struct Instante(pub f64);

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub ancho: f32,
    pub alto: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Parada {
    /// 0..=1 a lo largo del degradado.
    pub posicion: f32,
    pub color: Color,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Pintura {
    Solido(Color),
    /// Degradado lineal entre dos puntos relativos al rectángulo dibujado (0..=1).
    Lineal {
        desde: (f32, f32),
        hasta: (f32, f32),
        paradas: Vec<Parada>,
    },
    /// Degradado radial; centro y radios relativos al rectángulo dibujado.
    Radial {
        centro: (f32, f32),
        radio: (f32, f32),
        paradas: Vec<Parada>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Alineacion {
    Inicio,
    Centro,
    Fin,
}

/// Fuente ya resuelta desde los tokens del sistema de diseño.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Fuente {
    /// Familia registrada por la plataforma (p. ej. "Inter").
    pub familia: String,
    /// 100..=900.
    pub peso: u16,
    pub tamano: f32,
    /// Espaciado entre letras en DIP (CSS `letter-spacing`).
    pub interletra: f32,
    /// Altura de línea en DIP; la línea base se coloca como en CSS.
    pub interlinea: f32,
    /// Números tabulares (`tnum`).
    pub tabulares: bool,
    pub mayusculas: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Dibujo {
    Rect {
        rect: Rect,
        /// Radios de esquina: arriba-izq, arriba-der, abajo-der, abajo-izq.
        radios: [f32; 4],
        relleno: Option<Pintura>,
        borde: Option<(f32, Pintura)>,
    },
    Texto {
        /// Caja de la línea (ancho = espacio disponible; el texto se recorta con «…»).
        caja: Rect,
        texto: String,
        fuente: Fuente,
        color: Color,
        alineacion: Alineacion,
    },
    /// Sombra o brillo exterior de un rectángulo redondeado (desenfoque gaussiano).
    Sombra {
        rect: Rect,
        radios: [f32; 4],
        color: Color,
        desenfoque: f32,
        desplazamiento: (f32, f32),
    },
    /// Recorta los dibujos siguientes hasta `FinRecorte`.
    Recorte { rect: Rect, radios: [f32; 4] },
    FinRecorte,
}

/// Propiedades que compone `DirectComposition` sin repintar el contenido.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Propiedad {
    Opacidad,
    /// Traslación en DIP respecto a la posición de maquetación.
    X,
    Y,
    /// Escala alrededor del centro de la capa.
    Escala,
    /// Giro en grados alrededor del centro de la capa.
    Giro,
}

/// Tramo `valor(t) = a + b·t + c·t² + d·t³`, con `t` en segundos desde `inicio`.
/// Es exactamente la forma de `IDCompositionAnimation::AddCubic`.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Tramo {
    /// Desplazamiento en segundos desde el comienzo de la curva.
    pub desde: f64,
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
}

/// Curva completa: tramos ordenados, valor final, y repetición opcional
/// (`IDCompositionAnimation::AddRepeat`) desde `desde` durante `duracion`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Curva {
    pub inicio: Instante,
    pub tramos: Vec<Tramo>,
    /// Instante relativo (segundos) en que termina y se queda en `final_`.
    pub fin: f64,
    pub final_: f32,
    pub repetir: Option<(f64, f64)>,
}

/// Una operación sobre el árbol de capas. Se aplican en orden y luego
/// la plataforma hace un único `Commit` (atómico para todos los overlays).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Operacion {
    /// Crea una capa vacía como hija de `padre` (None = raíz de la salida),
    /// en la posición `orden` entre sus hermanas (0 = la de más abajo).
    Crear {
        id: CapaId,
        padre: Option<CapaId>,
        orden: u32,
    },
    /// Posición de maquetación (sin animar) y tamaño de la superficie.
    Colocar { id: CapaId, rect: Rect },
    /// Sustituye todo el contenido pintado de la capa (coordenadas locales).
    Pintar { id: CapaId, dibujos: Vec<Dibujo> },
    /// Fija un valor compuesto sin animación (cancela cualquier curva previa).
    Fijar {
        id: CapaId,
        propiedad: Propiedad,
        valor: f32,
    },
    /// Anima un valor compuesto; sustituye cualquier curva previa.
    Animar {
        id: CapaId,
        propiedad: Propiedad,
        curva: Curva,
    },
    /// Destruye la capa y todas sus hijas.
    Quitar { id: CapaId },
}

/// Lote de operaciones de un instante, en el orden en que deben aplicarse.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Lote {
    pub operaciones: Vec<Operacion>,
}
