//! Doble del núcleo de la prueba #2022 (VANTA-140): convierte una foto
//! ([`vantare_domain::Snapshot`]) en el modelo que pinta la receta `relativo`
//! con el sistema Vantare y la plantilla `standard` (la de por defecto).
//!
//! La ventana, los gaps firmados y los distintivos de vueltas salen de
//! `vantare_domain::relative` (`project_configured`); aquí solo se formatean
//! los textos que hoy produce el pintor `native/ui/src/relative/vantare.rs` y
//! se copian literalmente los que viven solo en `vantare-ui`: título,
//! contexto, detalle del coche, salida de boxes y textos del pie.
//!
//! Los huecos de la tabla no se omiten: cada hueco es una fila con `vacio:
//! true`, `id` estable (`hueco-<indice>`) y textos vacíos. Así el jugador no se
//! desplaza al desaparecer un vecino y la receta conserva la geometría de los
//! siete huecos de `standard` (±3).
//!
//! Lectura de fotos:
//! - [`leer_escena`] / [`fotos_de_escena`]: misma lectura que
//!   `native/ui/src/workshop.rs` para `.scene.json` (campos `label`, `frameMs`,
//!   `frames` y `watchFor`, y cada foto por `vantare_ipc::snapshot_from_saved_json`,
//!   que migra v7..v11 y valida el DTO).
//! - [`Canal`]: cliente del pipe del núcleo como el host de overlays
//!   (`Subscriber` de `vantare-ipc`); el hilo lector y su cierre los pone el
//!   suscriptor, que se une a sí mismo en `Drop`.

use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{Value, json};
use vantare_domain::format::{Language, PLACEHOLDER, Preferences};
use vantare_domain::relative::{self, Banner, Board, PitExit, Row, Side};
use vantare_domain::{CarId, DrivingSituation, Snapshot, SourceState};
use vantare_ipc::{Demand, Signal, Subscriber};

/// Alcance de la plantilla `standard` y de los ajustes por defecto
/// (`native/ui/src/relative/mod.rs:167-168`, `vantare.rs:153-154`).
const ADELANTE: usize = 3;
const ATRAS: usize = 3;
/// Umbral de `cerca`: menos de un segundo del jugador en valor absoluto.
const CERCA_S: f64 = 1.0;
/// Ventana de `standard`: clase del jugador, ±3 y con jugador.
const CONTENIDO: relative::Content = relative::Content {
    range_ahead: ADELANTE,
    range_behind: ATRAS,
    same_class: true,
    include_player: true,
};
/// Ajustes de presentación del modelo; el resto es la plantilla fija.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Ajustes {
    /// Idioma de los textos ya formateados (el pintor usa `Language`).
    pub idioma: Language,
    /// Marca Vantare en la cabecera (`brandVisible`, decidido por la licencia).
    pub marca: bool,
}

impl Default for Ajustes {
    fn default() -> Self {
        Self {
            idioma: Language::Es,
            marca: false,
        }
    }
}

/// Modelo del relativo para una foto.
///
/// Los textos salen ya formateados como los pinta el pintor actual; `filas`
/// lleva un elemento por hueco de la tabla (también los vacíos).
#[must_use]
pub fn modelo(foto: &Snapshot, ajustes: Ajustes) -> Value {
    let prefs = Preferences {
        language: ajustes.idioma,
        ..Preferences::default()
    };
    let board = relative::project_configured(foto, prefs, CONTENIDO, &[]);
    let es = ajustes.idioma == Language::Es;
    // El pintor sustituye la tabla por esqueletos si no hay jugador o la fuente
    // está esperando/perdida (`vantare::waiting`); el modelo no lleva filas.
    let esperando = !board.player_present
        || matches!(board.source_state, SourceState::Waiting | SourceState::Lost);
    let (aviso, aviso_texto, aviso_derecha) = if esperando {
        // `plan` no añade la franja cuando la tabla está en espera.
        ("ninguno", String::new(), String::new())
    } else {
        aviso_de(&board, es)
    };
    let (pie, pie_trafico, pie_salida, pie_perdida, pie_sesion) = pie_de(&board, es, esperando);
    let filas = if esperando {
        Vec::new()
    } else {
        board
            .slots
            .iter()
            .enumerate()
            .map(|(indice, fila)| fila_de(fila.as_deref(), indice, foto, es))
            .collect()
    };
    json!({
        "en_garaje": foto.state.driving_situation == DrivingSituation::Garage,
        "titulo": titulo(&board),
        "contexto": contexto(&board),
        "marca": ajustes.marca,
        "aviso_visible": aviso != "ninguno",
        "aviso": aviso,
        "aviso_texto": aviso_texto,
        "aviso_derecha": aviso_derecha,
        "filas": filas,
        "pie_visible": pie != "ninguno",
        "pie": pie,
        "pie_trafico": pie_trafico,
        "pie_salida": pie_salida,
        "pie_perdida": pie_perdida,
        "pie_sesion": pie_sesion,
    })
}

/// Una fila (o un hueco) de la tabla, con los textos del pintor.
fn fila_de(fila: Option<&Row>, indice: usize, foto: &Snapshot, es: bool) -> Value {
    let Some(fila) = fila else {
        return json!({
            "id": format!("hueco-{indice}"),
            "vacio": true,
            "posicion": "",
            "piloto": "",
            "detalle": "",
            "vueltas": "",
            "vueltas_visible": false,
            "gap": "",
            "clase": "otra",
            "lado": lado_de_hueco(indice),
            "jugador": false,
            "cerca": false,
            "boxes": false,
        });
    };
    let (vueltas, vueltas_visible) = vueltas_de(fila, es);
    json!({
        "id": fila.id.0.to_string(),
        "vacio": false,
        "posicion": fila.class_position.as_ref(),
        "piloto": piloto_de(fila, es),
        "detalle": detalle_de(&fila.vehicle, &fila.number),
        "vueltas": vueltas,
        "vueltas_visible": vueltas_visible,
        "gap": fila.rich_gap.as_ref(),
        "clase": clase_de(&fila.class),
        "lado": lado_de(fila.side),
        "jugador": fila.is_player,
        // El resalte es para rivales: el jugador nunca está «cerca» de sí mismo.
        "cerca": !fila.is_player
            && gap_relativo(foto, fila.id).is_some_and(|segundos| segundos.abs() < CERCA_S),
        "boxes": fila.in_pits,
    })
}

/// Nombre que pinta el pintor (`driver_text`, vantare.rs:257-263): «Tú»/«You»
/// para el jugador, el nombre completo del resto con la columna `driverName` de
/// `standard` (`format.mode` vacío).
fn piloto_de(fila: &Row, es: bool) -> String {
    if fila.side == Side::Player {
        // El jugador se pinta como «Tú»/«You»; el resto, con la columna.
        return (if es { "Tú" } else { "You" }).to_owned();
    }
    if fila.driver.is_empty() {
        return PLACEHOLDER.to_owned();
    }
    // `vantare-ui` pasa `options.name_mode` (vacío en `standard`) y `name_max` 16.
    vantare_domain::standings::driver_name(&fila.driver, "", 16)
}

/// Detalle del coche de `vehicle_detail` (vantare.rs:238-255) con la plantilla
/// `standard`: sin columna de dorsal, marca + « #dorsal» (p. ej. « · Ferrari #50»).
fn detalle_de(vehiculo: &str, numero: &str) -> String {
    let marca = vehiculo.split_whitespace().next().unwrap_or("");
    let dorsal = if numero.is_empty() {
        String::new()
    } else {
        format!(" #{numero}")
    };
    let detalle = format!("{marca}{dorsal}");
    let detalle = detalle.trim();
    if detalle.is_empty() {
        String::new()
    } else {
        format!(" · {detalle}")
    }
}

/// Distintivo de vueltas (`Labels::new`, vantare.rs:496-506): «−1 V»/«+2 V» en
/// español, «−1 L»/«+2 L» en inglés. Vacío y oculto si `lap_delta` falta o es
/// cero, como el pintor.
fn vueltas_de(fila: &Row, es: bool) -> (String, bool) {
    let Some(vueltas) = fila.lap_delta.filter(|vueltas| *vueltas != 0) else {
        return (String::new(), false);
    };
    let signo = if vueltas < 0 { "−" } else { "+" };
    let sufijo = if es { "V" } else { "L" };
    (format!("{signo}{} {sufijo}", vueltas.unsigned_abs()), true)
}

/// Clase de color que reconoce el kit Vantare (`styles/vantare.json:107-132`):
/// `hyper`, `lmp`, `gt` y `otra` para cualquier nombre sin coincidencia.
fn clase_de(nombre: &str) -> &'static str {
    let nombre = nombre.to_lowercase();
    if nombre.contains("hyper") {
        "hyper"
    } else if nombre.contains("lmp") {
        "lmp"
    } else if nombre.contains("gt") {
        "gt"
    } else {
        "otra"
    }
}

fn lado_de(lado: Side) -> &'static str {
    match lado {
        Side::Ahead => "delante",
        Side::Player => "jugador",
        Side::Behind => "detras",
    }
}

/// Lado del hueco por su índice: delante, jugador (índice `ADELANTE`), detrás.
fn lado_de_hueco(indice: usize) -> &'static str {
    match indice.cmp(&ADELANTE) {
        std::cmp::Ordering::Less => "delante",
        std::cmp::Ordering::Equal => "jugador",
        std::cmp::Ordering::Greater => "detras",
    }
}

/// Gap relativo firmado de `domain::relative` (`relative_s`, admite stale).
fn gap_relativo(foto: &Snapshot, id: CarId) -> Option<f64> {
    foto.state
        .cars
        .iter()
        .find(|coche| coche.id == id)?
        .relative_s
        .last_known()
        .copied()
        .filter(|segundos| segundos.is_finite())
}

/// Título de la cabecera (`Labels::new`, vantare.rs:435-438): «RELATIVE» o
/// «RELATIVE · sesión» fuera de carrera.
fn titulo(board: &Board) -> String {
    let sesion = board.session.as_str();
    if sesion.is_empty() || sesion == "CARRERA" || sesion == "RACE" {
        "RELATIVE".to_owned()
    } else {
        format!("RELATIVE · {sesion}")
    }
}

/// Texto derecho de la cabecera (`Labels::new`, vantare.rs:442-445): «±3» o
/// «CLASE · ±3».
fn contexto(board: &Board) -> String {
    let rango = format!("±{}", ADELANTE.max(ATRAS));
    board.slower_class.as_ref().map_or_else(
        || rango.clone(),
        |clase| format!("{} · {rango}", clase.to_uppercase()),
    )
}

/// Franja de aviso (`banner`, vantare.rs:960-985). El pintor pinta el título en
/// mayúsculas (`band`, paint.rs:493).
fn aviso_de(board: &Board, es: bool) -> (&'static str, String, String) {
    let Some(aviso) = board.banner.as_ref() else {
        return ("ninguno", String::new(), String::new());
    };
    match aviso {
        Banner::FullCourseYellow => ("fcy", "FCY".to_owned(), String::new()),
        Banner::LocalYellow(sector) => (
            "amarilla",
            format!(
                "{} · Sector {sector}",
                if es { "Amarilla" } else { "Yellow" }
            )
            .to_uppercase(),
            String::new(),
        ),
        Banner::InPits => {
            let titulo = if es { "En boxes" } else { "In the pits" };
            let derecha = if board.pit_limiter {
                if es { "limitador" } else { "limiter" }
            } else {
                ""
            };
            ("boxes", titulo.to_uppercase(), derecha.to_owned())
        }
    }
}

/// Pie visible (`plan`, vantare.rs:348-361), su texto y los textos de las otras
/// variantes vacíos: el pintor solo pinta una variante por fotograma.
fn pie_de(
    board: &Board,
    es: bool,
    esperando: bool,
) -> (&'static str, String, String, String, String) {
    let pie = if esperando {
        "espera"
    } else if board.player_in_pits && board.pit_exit.is_some() {
        "boxes"
    } else if board.traffic.is_some() {
        "trafico"
    } else if !board.session.is_empty() && board.session != "CARRERA" && board.session != "RACE" {
        "sesion"
    } else {
        "ninguno"
    };
    match pie {
        "trafico" => (
            pie,
            board.traffic.as_ref().map_or_else(String::new, |trafico| {
                format!(
                    "{} {} {}",
                    trafico.count,
                    trafico.class,
                    if es { "a menos de 6 s" } else { "within 6 s" }
                )
            }),
            String::new(),
            String::new(),
            String::new(),
        ),
        "boxes" => {
            let (salida, perdida) = board.pit_exit.as_ref().map_or_else(
                || (String::new(), String::new()),
                |salida| (salida_de(salida, es), perdida_de(salida, es)),
            );
            (pie, String::new(), salida, perdida, String::new())
        }
        "sesion" => (
            pie,
            String::new(),
            String::new(),
            String::new(),
            sesion_de(board, es),
        ),
        _ => (
            pie,
            String::new(),
            String::new(),
            String::new(),
            String::new(),
        ),
    }
}

/// Texto de salida de boxes (`Labels::exit` del pintor).
fn salida_de(salida: &PitExit, es: bool) -> String {
    match (&salida.ahead, &salida.behind, es) {
        (Some(delante), Some(detras), true) => format!("Sales entre {delante} y {detras}"),
        (Some(delante), Some(detras), false) => {
            format!("You rejoin between {delante} and {detras}")
        }
        (Some(delante), None, true) => format!("Sales tras {delante}"),
        (Some(delante), None, false) => format!("You rejoin behind {delante}"),
        (None, Some(detras), true) => format!("Sales delante de {detras}"),
        (None, Some(detras), false) => format!("You rejoin ahead of {detras}"),
        (None, None, true) => "Sales con pista libre".to_owned(),
        (None, None, false) => "You rejoin on a clear track".to_owned(),
    }
}

/// Pérdida estimada de la parada (`Labels::loss` del pintor).
fn perdida_de(salida: &PitExit, es: bool) -> String {
    format!("{} {}", if es { "pérdida" } else { "loss" }, salida.loss)
}

/// Texto del pie de sesión (`Footer::Session` del pintor).
fn sesion_de(board: &Board, es: bool) -> String {
    let texto = if board.session.to_lowercase().starts_with("pr") {
        if es { "Tanda —" } else { "Run —" }
    } else if es {
        "Delta de vuelta lanzada —"
    } else {
        "Flying lap delta —"
    };
    texto.to_owned()
}

// ---------------------------------------------------------------------------
// Lectura de fotos
// ---------------------------------------------------------------------------

/// Error de lectura de escenas o del pipe, con el contexto de qué falló.
#[derive(Debug)]
pub enum Error {
    Leer {
        ruta: PathBuf,
        fuente: std::io::Error,
    },
    Escena {
        fuente: serde_json::Error,
    },
    Estructura(&'static str),
    Foto {
        indice: usize,
        fuente: vantare_ipc::Error,
    },
    NombreDePipe(std::io::Error),
    Suscripcion(vantare_ipc::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Leer { ruta, fuente } => {
                write!(f, "no se pudo leer {}: {fuente}", ruta.display())
            }
            Self::Escena { fuente } => write!(f, "escena: JSON inválido: {fuente}"),
            Self::Estructura(motivo) => write!(f, "escena: {motivo}"),
            Self::Foto { indice, fuente } => write!(f, "escena: foto {indice}: {fuente}"),
            Self::NombreDePipe(fuente) => {
                write!(f, "no se pudo obtener el nombre del pipe: {fuente}")
            }
            Self::Suscripcion(fuente) => {
                write!(f, "no se pudo abrir el pipe del núcleo: {fuente}")
            }
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Leer { fuente, .. } | Self::NombreDePipe(fuente) => Some(fuente),
            Self::Escena { fuente } => Some(fuente),
            Self::Foto { fuente, .. } | Self::Suscripcion(fuente) => Some(fuente),
            Self::Estructura(_) => None,
        }
    }
}

/// Lee una escena `.scene.json` del disco y devuelve sus fotos.
///
/// # Errors
/// No se puede leer el fichero, el JSON no es una escena válida o una foto no
/// pasa la validación de `vantare_ipc`.
pub fn leer_escena(ruta: impl AsRef<Path>) -> Result<Vec<Snapshot>, Error> {
    let ruta = ruta.as_ref();
    let texto = std::fs::read_to_string(ruta).map_err(|fuente| Error::Leer {
        ruta: ruta.to_path_buf(),
        fuente,
    })?;
    fotos_de_escena(&texto)
}

/// Fotos de una escena ya leída. Réplica del lector de `native/ui`:
/// `label`, `frameMs` (50..=60000), `frames` no vacío, `watchFor` y cada foto
/// por `snapshot_from_saved_json` (migra v7..v11, valida el DTO).
///
/// # Errors
/// JSON mal formado, campos de escena ausentes/fuera de rango, escena vacía o
/// foto inválida.
pub fn fotos_de_escena(texto: &str) -> Result<Vec<Snapshot>, Error> {
    let documento: Value =
        serde_json::from_str(texto).map_err(|fuente| Error::Escena { fuente })?;
    let objeto = documento
        .as_object()
        .ok_or(Error::Estructura("se esperaba un objeto de escena"))?;
    if objeto.get("label").and_then(Value::as_str).is_none() {
        return Err(Error::Estructura("falta label"));
    }
    if objeto.get("watchFor").and_then(Value::as_str).is_none() {
        return Err(Error::Estructura("falta watchFor"));
    }
    let frame_ms = objeto
        .get("frameMs")
        .and_then(Value::as_u64)
        .ok_or(Error::Estructura("falta frameMs"))?;
    if !(50..=60_000).contains(&frame_ms) {
        return Err(Error::Estructura("frameMs fuera de 50..=60000"));
    }
    let frames = objeto
        .get("frames")
        .and_then(Value::as_array)
        .ok_or(Error::Estructura("falta frames"))?;
    if frames.is_empty() {
        return Err(Error::Estructura("la escena no contiene fotos"));
    }
    frames
        .iter()
        .enumerate()
        .map(|(indice, frame)| {
            let foto = frame
                .get("snapshot")
                .ok_or(Error::Estructura("frame sin snapshot"))?;
            vantare_ipc::snapshot_from_saved_json(&foto.to_string())
                .map_err(|fuente| Error::Foto { indice, fuente })
        })
        .collect()
}

/// Cliente del pipe del núcleo, bloqueante: [`Canal::siguiente`] espera la
/// próxima foto. El hilo lector y su cierre son los de `Subscriber`, que al
/// caer detiene la E/S y se une (`native/ipc/src/subscriber.rs:189`).
pub struct Canal {
    suscriptor: Subscriber,
}

impl Canal {
    /// Abre el pipe con la demanda del relativo. `None` usa el nombre por
    /// defecto del núcleo (`vantare-core-<usuario>`).
    ///
    /// # Errors
    /// El sistema no puede resolver el nombre del pipe o crear el suscriptor.
    pub fn abrir(nombre: Option<&str>) -> Result<Self, Error> {
        let nombre = match nombre {
            Some(nombre) => nombre.to_owned(),
            None => vantare_ipc::default_pipe_name().map_err(Error::NombreDePipe)?,
        };
        let demanda = demanda_relativo();
        let suscriptor = Subscriber::connect_requested(&nombre, demanda, |_| true)
            .map_err(Error::Suscripcion)?;
        Ok(Self { suscriptor })
    }

    /// Espera hasta `espera` la siguiente foto; `None` si no llega ninguna.
    pub fn siguiente(&mut self, espera: Duration) -> Option<Arc<Snapshot>> {
        self.suscriptor.next(espera)
    }

    /// Diagnóstico del host de overlays: el par habla otra versión
    /// (`native/ui/src/connection.rs`).
    #[must_use]
    pub fn incompatible(&self) -> bool {
        self.suscriptor.connection().incompatible()
    }
}

/// Señales que necesita el relativo `standard` (como `Settings::demand`).
fn demanda_relativo() -> Demand {
    let mut demanda = Demand::default();
    for senal in [
        Signal::Cars,
        Signal::Relative,
        Signal::Positions,
        Signal::PitStatus,
        Signal::SessionInfo,
        Signal::TrackName,
        Signal::Flags,
        Signal::LapTimes,
    ] {
        demanda.request(senal, 33);
    }
    demanda.request(Signal::SessionClock, 250);
    demanda.request(Signal::Weather, 500);
    demanda
}

// ---------------------------------------------------------------------------
// Tests del doble del núcleo (los ejecuta `cargo test --example relativo`)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Map, Value};
    use vantare_domain::{Flag, FlagKind, FlagScope, Quality, SessionKind};

    const ESCENA: &str = include_str!("../../../ui/fixtures/relative-vantare.scene.json");
    const CONTRATO: &str = include_str!("../../modelos/relativo.modelo.json");

    fn fotos() -> Vec<Snapshot> {
        fotos_de_escena(ESCENA).expect("escena del catálogo")
    }

    fn filas(modelo: &Value) -> &[Value] {
        modelo["filas"].as_array().expect("lista de filas")
    }

    fn bool_de(valor: &Value) -> bool {
        valor.as_bool().expect("booleano del modelo")
    }

    #[test]
    fn el_lector_rechaza_escenas_incompletas() {
        assert!(matches!(
            fotos_de_escena("{}"),
            Err(Error::Estructura("falta label"))
        ));
        let sin_fotos = r#"{"label":"x","frameMs":100,"watchFor":"y","frames":[]}"#;
        assert!(matches!(
            fotos_de_escena(sin_fotos),
            Err(Error::Estructura("la escena no contiene fotos"))
        ));
        let fase_corta = r#"{"label":"x","frameMs":10,"watchFor":"y","frames":[{"snapshot":{}}]}"#;
        assert!(matches!(
            fotos_de_escena(fase_corta),
            Err(Error::Estructura("frameMs fuera de 50..=60000"))
        ));
    }

    #[test]
    fn primera_foto_pinta_los_textos_del_pintor() {
        let fotos = fotos();
        let modelo = modelo(&fotos[0], Ajustes::default());
        assert!(!bool_de(&modelo["en_garaje"]));
        assert_eq!(modelo["titulo"], "RELATIVE");
        assert_eq!(modelo["contexto"], "±3");
        assert!(!bool_de(&modelo["marca"]));
        assert!(!bool_de(&modelo["aviso_visible"]));
        assert_eq!(modelo["aviso"], "ninguno");
        assert_eq!(modelo["aviso_texto"], "");
        assert_eq!(modelo["aviso_derecha"], "");
        assert!(!bool_de(&modelo["pie_visible"]));
        assert_eq!(modelo["pie"], "ninguno");

        // Siete huecos: [vacío, Lotterer, Pier Guidi, jugador, Buemi, Rast, vacío].
        // El jugador es el de la foto (Ferrari #50, P3) y conserva su hueco.
        let filas = filas(&modelo);
        assert_eq!(filas.len(), 7);
        let esperadas = [
            ("hueco-0", "", "", "", "", "delante", "otra"),
            (
                "3",
                "P1",
                "A. Lotterer",
                " · Porsche #6",
                "-3.8",
                "delante",
                "hyper",
            ),
            (
                "4",
                "P2",
                "A. Pier Guidi",
                " · Ferrari #51",
                "-2.5",
                "delante",
                "hyper",
            ),
            ("5", "P3", "Tú", " · Ferrari #50", "0.0", "jugador", "hyper"),
            (
                "7",
                "P4",
                "S. Buemi",
                " · Toyota #8",
                "+3.3",
                "detras",
                "hyper",
            ),
            (
                "8",
                "P5",
                "R. Rast",
                " · BMW #20",
                "+5.7",
                "detras",
                "hyper",
            ),
            ("hueco-6", "", "", "", "", "detras", "otra"),
        ];
        for (fila, (id, posicion, piloto, detalle, gap, lado, clase)) in filas.iter().zip(esperadas)
        {
            assert_eq!(fila["id"], id);
            assert_eq!(fila["posicion"], posicion);
            assert_eq!(fila["piloto"], piloto);
            assert_eq!(fila["detalle"], detalle);
            assert_eq!(fila["gap"], gap);
            assert_eq!(fila["lado"], lado);
            assert_eq!(fila["clase"], clase);
            assert_eq!(bool_de(&fila["vacio"]), id.starts_with("hueco-"));
            assert_eq!(fila["vueltas"], "");
            assert!(!bool_de(&fila["vueltas_visible"]));
            assert_eq!(bool_de(&fila["jugador"]), id == "5");
            assert!(!bool_de(&fila["cerca"]));
            assert!(!bool_de(&fila["boxes"]));
        }
    }

    #[test]
    fn cerca_solo_con_gap_absoluto_menor_de_un_segundo() {
        let mut foto = fotos()[0].clone();
        let hasta = |foto: &mut Snapshot, id: u32, segundos: f64| {
            let coche = foto
                .state
                .cars
                .iter_mut()
                .find(|coche| coche.id == CarId(id))
                .expect("coche de la foto");
            coche.relative_s = Quality::Reliable(segundos);
        };
        // 0,999 s delante: cerca. 1,0 s exacto: fuera. 0,5 s detrás: cerca.
        hasta(&mut foto, 4, 0.999);
        assert!(bool_de(
            &fila_por_id(&modelo(&foto, Ajustes::default()), "4")["cerca"]
        ));
        hasta(&mut foto, 4, 1.0);
        assert!(!bool_de(
            &fila_por_id(&modelo(&foto, Ajustes::default()), "4")["cerca"]
        ));
        hasta(&mut foto, 4, 2.5);
        hasta(&mut foto, 7, -0.5);
        let modelo = modelo(&foto, Ajustes::default());
        assert!(bool_de(&fila_por_id(&modelo, "7")["cerca"]));
        assert!(!bool_de(&fila_por_id(&modelo, "4")["cerca"]));
        // El jugador no es un rival cerca de sí mismo.
        assert!(!bool_de(&fila_por_id(&modelo, "5")["cerca"]));
    }

    fn fila_por_id<'a>(modelo: &'a Value, id: &str) -> &'a Value {
        filas(modelo)
            .iter()
            .find(|fila| fila["id"] == id)
            .unwrap_or_else(|| panic!("fila {id}"))
    }

    #[test]
    fn en_garaje_es_la_situacion_de_conduccion_del_snapshot() {
        let mut foto = fotos()[0].clone();
        foto.state.driving_situation = DrivingSituation::Garage;
        assert!(bool_de(&modelo(&foto, Ajustes::default())["en_garaje"]));
        foto.state.driving_situation = DrivingSituation::OnTrack;
        assert!(!bool_de(&modelo(&foto, Ajustes::default())["en_garaje"]));
    }

    #[test]
    fn avisos_y_pie_siguen_la_prioridad_del_pintor() {
        let fotos = fotos();
        // Foto 1: el jugador es LMGT3 y lleva Hypercars más rápidos detrás.
        let trafico = modelo(&fotos[1], Ajustes::default());
        assert_eq!(trafico["contexto"], "LMGT3 · ±3");
        assert_eq!(trafico["pie"], "trafico");
        assert!(bool_de(&trafico["pie_visible"]));
        assert_eq!(trafico["pie_trafico"], "2 Hypercar a menos de 6 s");
        assert_eq!(trafico["pie_salida"], "");
        // Foto 2: en boxes con limitador y estimación de salida.
        let boxes = modelo(&fotos[2], Ajustes::default());
        assert_eq!(boxes["aviso"], "boxes");
        assert!(bool_de(&boxes["aviso_visible"]));
        assert_eq!(boxes["aviso_texto"], "EN BOXES");
        assert_eq!(boxes["aviso_derecha"], "limitador");
        assert_eq!(boxes["pie"], "boxes");
        assert_eq!(boxes["pie_salida"], "Sales entre Rossi (#46) y Buemi (#8)");
        assert_eq!(boxes["pie_perdida"], "pérdida 27.4 s");
        assert!(bool_de(&fila_por_id(&boxes, "5")["boxes"]));
        // Foto 3: FCY (la amarilla de sesión manda sobre la de sector).
        let fcy = modelo(&fotos[3], Ajustes::default());
        assert_eq!(fcy["aviso"], "fcy");
        assert_eq!(fcy["aviso_texto"], "FCY");
        assert_eq!(fcy["aviso_derecha"], "");
        // Foto 4: sin datos, el pintor cambia la tabla por esqueletos y espera.
        let espera = modelo(&fotos[4], Ajustes::default());
        assert_eq!(espera["pie"], "espera");
        assert!(bool_de(&espera["pie_visible"]));
        assert_eq!(espera["titulo"], "RELATIVE");
        assert_eq!(espera["contexto"], "±3");
        assert!(filas(&espera).is_empty());
    }

    #[test]
    fn amarilla_de_sector_y_sesion_de_practica() {
        let mut amarilla = fotos()[0].clone();
        amarilla.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Sector(1),
        }]);
        let modelo_amarilla = modelo(&amarilla, Ajustes::default());
        assert_eq!(modelo_amarilla["aviso"], "amarilla");
        assert_eq!(modelo_amarilla["aviso_texto"], "AMARILLA · SECTOR 2");
        assert!(bool_de(&modelo_amarilla["aviso_visible"]));

        let mut practica = fotos()[0].clone();
        practica.state.session.kind = Quality::Reliable(SessionKind::Practice);
        let modelo_practica = modelo(&practica, Ajustes::default());
        assert_eq!(modelo_practica["titulo"], "RELATIVE · PRÁCTICA");
        assert_eq!(modelo_practica["pie"], "sesion");
        assert_eq!(modelo_practica["pie_sesion"], "Tanda —");
        assert!(bool_de(&modelo_practica["pie_visible"]));
    }

    #[test]
    fn textos_en_ingles_y_marca() {
        let mut foto = fotos()[0].clone();
        foto.state
            .cars
            .iter_mut()
            .find(|coche| coche.id == CarId(3))
            .expect("coche de la foto")
            .relative_laps = Quality::Reliable(2);
        let ingles = modelo(
            &foto,
            Ajustes {
                idioma: Language::En,
                marca: true,
            },
        );
        assert!(bool_de(&ingles["marca"]));
        assert_eq!(fila_por_id(&ingles, "5")["piloto"], "You");
        assert_eq!(fila_por_id(&ingles, "3")["vueltas"], "+2 L");
        assert!(bool_de(&fila_por_id(&ingles, "3")["vueltas_visible"]));
        let trafico = modelo(
            &fotos()[1],
            Ajustes {
                idioma: Language::En,
                marca: false,
            },
        );
        assert_eq!(trafico["pie_trafico"], "2 Hypercar within 6 s");
    }

    #[test]
    fn sin_jugador_no_hay_franja_aunque_la_fuente_este_viva() {
        let mut foto = fotos()[0].clone();
        foto.state.player = None;
        foto.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        let modelo = modelo(&foto, Ajustes::default());
        assert_eq!(modelo["pie"], "espera");
        assert_eq!(modelo["aviso"], "ninguno");
        assert!(!bool_de(&modelo["aviso_visible"]));
        assert!(filas(&modelo).is_empty());
    }

    #[test]
    fn el_modelo_cumple_el_contrato_en_todas_las_fotos() {
        let contrato: Value = serde_json::from_str(CONTRATO).expect("contrato válido");
        assert_eq!(contrato["modelo"], "relativo/1");
        for (indice, foto) in fotos().iter().enumerate() {
            for ajustes in [
                Ajustes::default(),
                Ajustes {
                    idioma: Language::En,
                    marca: true,
                },
            ] {
                let modelo = modelo(foto, ajustes);
                valida_modelo(&modelo, &contrato)
                    .unwrap_or_else(|fallo| panic!("foto {indice} ({ajustes:?}): {fallo}"));
            }
        }
        let mut garage = fotos()[0].clone();
        garage.state.driving_situation = DrivingSituation::Garage;
        valida_modelo(&modelo(&garage, Ajustes::default()), &contrato).expect("foto en garaje");
    }

    /// Valida el JSON contra el contrato: todos los campos, tipos correctos,
    /// valores de enum declarados y sin campos de más.
    fn valida_modelo(modelo: &Value, contrato: &Value) -> Result<(), String> {
        let campos = contrato["campos"]
            .as_object()
            .ok_or("el contrato no declara campos")?;
        valida_campos(modelo, campos, "modelo")
    }

    fn valida_campos(valor: &Value, campos: &Map<String, Value>, ruta: &str) -> Result<(), String> {
        let objeto = valor
            .as_object()
            .ok_or_else(|| format!("{ruta}: se esperaba un objeto"))?;
        for (clave, tipo) in campos {
            let campo = objeto
                .get(clave)
                .ok_or_else(|| format!("{ruta}/{clave}: falta"))?;
            valida_tipo(campo, tipo, &format!("{ruta}/{clave}"))?;
        }
        for clave in objeto.keys() {
            if !campos.contains_key(clave) {
                return Err(format!("{ruta}/{clave}: campo no declarado"));
            }
        }
        Ok(())
    }

    fn valida_tipo(valor: &Value, tipo: &Value, ruta: &str) -> Result<(), String> {
        match tipo {
            Value::String(nombre) => match nombre.as_str() {
                "bool" if valor.is_boolean() => Ok(()),
                "texto" if valor.is_string() => Ok(()),
                "numero" if valor.is_number() => Ok(()),
                "bool" | "texto" | "numero" => {
                    Err(format!("{ruta}: se esperaba {nombre}, llegó {valor}"))
                }
                otro => Err(format!("{ruta}: tipo desconocido {otro}")),
            },
            Value::Object(mapa) => {
                if let Some(valores) = mapa.get("enum") {
                    let texto = valor
                        .as_str()
                        .ok_or_else(|| format!("{ruta}: se esperaba un enum de texto"))?;
                    let declarados = valores
                        .as_array()
                        .ok_or_else(|| format!("{ruta}: enum sin valores"))?;
                    if declarados.iter().any(|declarado| declarado == texto) {
                        return Ok(());
                    }
                    Err(format!("{ruta}: «{texto}» no está declarado en el enum"))
                } else if let Some(lista) = mapa.get("lista") {
                    let elementos = valor
                        .as_array()
                        .ok_or_else(|| format!("{ruta}: se esperaba una lista"))?;
                    let campos = lista
                        .as_object()
                        .ok_or_else(|| format!("{ruta}: lista sin campos"))?;
                    let mut ids = std::collections::BTreeSet::new();
                    for (indice, elemento) in elementos.iter().enumerate() {
                        valida_campos(elemento, campos, &format!("{ruta}[{indice}]"))?;
                        let id = elemento["id"]
                            .as_str()
                            .ok_or_else(|| format!("{ruta}[{indice}]/id: se esperaba texto"))?;
                        if !ids.insert(id.to_owned()) {
                            return Err(format!("{ruta}[{indice}]/id: repetido «{id}»"));
                        }
                    }
                    Ok(())
                } else {
                    Err(format!("{ruta}: tipo de objeto no admitido"))
                }
            }
            otro => Err(format!("{ruta}: tipo de contrato no admitido: {otro}")),
        }
    }
}
