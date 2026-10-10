//! Grabadora del corpus temporal real de Assetto Corsa Competizione (ACC).
//!
//! Herramienta de captura para ejecutar en el PC del juego: lee a la vez la
//! memoria compartida de ACC y su feed UDP de *broadcasting*, y lo vuelca en un
//! directorio con `shm.bin`, `udp.bin` y `manifest.json`. Al terminar lo
//! empaqueta en `acc-<pista>-<tipo>-<fecha>.tar.gz`.
//!
//! ```text
//! vantare-grabar-acc [--salida <dir>] [--segundos N] [--pista <nombre>]
//!                    [--tipo <practica|carrera|...>]
//! ```
//!
//! - **Memoria compartida:** abre `Local\acpmf_physics`, `Local\acpmf_graphics`
//!   y `Local\acpmf_static` con `OpenFileMappingW` (solo lectura). Si una página
//!   no existe (ACC cerrado o en carga) espera y reintenta cada segundo sin
//!   terminar. Por cada `packetId` nuevo se guarda el blob crudo con cabecera;
//!   `static` se guarda al principio y cada vez que cambia.
//! - **Broadcasting UDP:** lee el puerto y las contraseñas de
//!   `Documents\Assetto Corsa Competizione\Config\broadcasting.json`, se
//!   registra con `REGISTER_COMMAND_APPLICATION` (versión 4 del protocolo,
//!   intervalo 100 ms), pide `REQUEST_ENTRY_LIST` y `REQUEST_TRACK_DATA`, y
//!   guarda cada datagrama tal cual llega, incluido `REGISTRATION_RESULT`. Al
//!   cerrar envía `UNREGISTER_COMMAND_APPLICATION`. Sin ese fichero se indica
//!   cómo habilitarlo y la grabación sigue con la memoria compartida.
//! - **Parada:** Ctrl+C o `--segundos N`; entonces vuelca, calcula los
//!   SHA-256, escribe el manifiesto y empaqueta. Si el empaquetado falla queda
//!   el directorio con los ficheros crudos.
//!
//! La resolución del temporizador se sube a 1 ms mientras dura la captura para
//! muestrear `physics` a ~1 kHz; al terminar se restaura.
//!
//! ## Formatos
//!
//! `shm.bin` concatena registros de cabecera fija (13 bytes) y blob crudo del
//! tamaño de su página:
//!
//! ```text
//! [u8 kind][u32 packetId LE][u64 t_rel_ns LE][blob crudo]
//! kind 0 = physics (800 B), 1 = graphics (1588 B), 2 = static (820 B)
//! ```
//!
//! La página `static` no publica `packetId`: ese campo lleva un contador
//! sintético (0 para la primera lectura, +1 por cada cambio).
//!
//! `udp.bin` guarda cada datagrama tal cual llegó:
//!
//! ```text
//! [u32 len LE][u64 t_rel_ns LE][bytes]
//! ```
//!
//! `t_rel_ns` es el tiempo transcurrido desde el inicio de la grabación.
//! El manifiesto sigue el esquema `vantare.acc-temporal-v1` con
//! `acVersion`/`smVersion` leídos de `static`, la pista y el tipo indicados, la
//! fecha UTC de inicio, la duración, el número de eventos por tipo y el
//! SHA-256 de cada fichero.

use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use flate2::Compression;
use flate2::write::GzEncoder;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[cfg(windows)]
use std::net::UdpSocket;
#[cfg(windows)]
use std::sync::atomic::Ordering;
#[cfg(windows)]
use std::time::Instant;

const USAGE: &str = "uso: vantare-grabar-acc [--salida <dir>] [--segundos N] [--pista <nombre>] \
                     [--tipo <practica|carrera|...>]";

/// Esquema del manifiesto del corpus.
const ESQUEMA: &str = "vantare.acc-temporal-v1";
/// Nombre con el que la grabadora se identifica ante ACC.
const NOMBRE_APP: &str = "vantare-grabar-acc";

/// Páginas de memoria compartida de ACC y sus tamaños publicados.
const NOMBRE_PHYSICS: &str = r"Local\acpmf_physics";
const NOMBRE_GRAPHICS: &str = r"Local\acpmf_graphics";
const NOMBRE_STATIC: &str = r"Local\acpmf_static";
const TAM_PHYSICS: usize = 800;
const TAM_GRAPHICS: usize = 1_588;
const TAM_STATIC: usize = 820;

/// `kind` de cada blob dentro de `shm.bin`.
const KIND_PHYSICS: u8 = 0;
const KIND_GRAPHICS: u8 = 1;
const KIND_STATIC: u8 = 2;

/// Mensajes del protocolo de broadcasting; `RESULTADO_REGISTRO` es el único
/// entrante que se interpreta (los demás se guardan crudos).
const PROTOCOLO_VERSION: u8 = 4;
const MSG_REGISTRO: u8 = 1;
const MSG_DESREGISTRO: u8 = 9;
const MSG_PEDIR_LISTA: u8 = 10;
const MSG_PEDIR_PISTA: u8 = 11;
const RESULTADO_REGISTRO: u8 = 1;

/// Intervalo pedido a ACC entre actualizaciones del feed (ms).
const INTERVALO_MS: u32 = 100;
/// Reintento del registro; también reconecta si ACC se reinicia a mitad.
#[cfg(windows)]
const REINTENTO_REGISTRO: Duration = Duration::from_secs(2);
/// Una pausa breve del feed no justifica renovar una conexión ya admitida.
#[cfg(windows)]
const SILENCIO_CONEXION: Duration = Duration::from_secs(10);

/// Intentos de una lectura estable antes de descartarla.
const MAX_INTENTOS_ESTABLES: usize = 4;

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
struct Args {
    salida: Option<PathBuf>,
    segundos: Option<u64>,
    pista: String,
    tipo: String,
}

fn parse(args: &[String]) -> Result<Args, String> {
    let (mut salida, mut segundos, mut pista, mut tipo) = (None, None, None, None);
    let mut args = args.iter();
    while let Some(flag) = args.next() {
        let mut value = || {
            args.next()
                .cloned()
                .ok_or_else(|| format!("{flag} necesita un valor"))
        };
        match flag.as_str() {
            "--salida" => salida = Some(PathBuf::from(value()?)),
            "--segundos" => {
                let texto = value()?;
                segundos = Some(
                    texto
                        .parse::<u64>()
                        .ok()
                        .filter(|segundos| *segundos > 0)
                        .ok_or_else(|| format!("segundos no válidos: {texto}"))?,
                );
            }
            "--pista" => pista = Some(value()?),
            "--tipo" => tipo = Some(value()?),
            otro => return Err(format!("argumento desconocido: {otro}")),
        }
    }
    Ok(Args {
        salida,
        segundos,
        pista: pista.unwrap_or_else(|| "desconocida".into()),
        tipo: tipo.unwrap_or_else(|| "desconocida".into()),
    })
}

// ---------------------------------------------------------------------------
// Lectura estable
// ---------------------------------------------------------------------------

/// Copia con lectura estable tipo seqlock: lee el `packetId`, copia la página y
/// lo vuelve a leer; si cambió durante la copia, la descarta y reintenta.
/// Devuelve el `packetId` del intento que se aceptó.
fn copia_estable(
    destino: &mut [u8],
    mut leer_packet_id: impl FnMut() -> u32,
    mut copiar: impl FnMut(&mut [u8]) -> io::Result<()>,
) -> io::Result<u32> {
    if destino.len() < 4 {
        return Err(io::Error::from(io::ErrorKind::InvalidInput));
    }
    for _ in 0..MAX_INTENTOS_ESTABLES {
        let antes = leer_packet_id();
        copiar(destino)?;
        if leer_packet_id() == antes && destino[..4] == antes.to_le_bytes() {
            return Ok(antes);
        }
    }
    Err(io::Error::new(
        io::ErrorKind::WouldBlock,
        "lectura rasgada por el escritor",
    ))
}

/// Variante para páginas sin `packetId` (`static`): se acepta la copia cuando
/// dos lecturas seguidas coinciden byte a byte.
fn copia_estable_por_igualdad(
    destino: &mut [u8],
    scratch: &mut [u8],
    mut copiar: impl FnMut(&mut [u8]) -> io::Result<()>,
) -> io::Result<()> {
    if destino.len() != scratch.len() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "búferes de distinto tamaño",
        ));
    }
    copiar(destino)?;
    for _ in 0..MAX_INTENTOS_ESTABLES {
        copiar(scratch)?;
        if destino == scratch {
            return Ok(());
        }
        destino.copy_from_slice(scratch);
    }
    Err(io::Error::new(
        io::ErrorKind::WouldBlock,
        "la página no se estabilizó",
    ))
}

// ---------------------------------------------------------------------------
// Protocolo UDP v4
// ---------------------------------------------------------------------------

/// Cadena con prefijo de longitud (u16 LE) + UTF-8, como todo el protocolo.
fn escribir_cadena(salida: &mut Vec<u8>, texto: &str) -> io::Result<()> {
    let bytes = texto.as_bytes();
    let longitud = u16::try_from(bytes.len()).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "texto demasiado largo para el protocolo",
        )
    })?;
    salida.extend_from_slice(&longitud.to_le_bytes());
    salida.extend_from_slice(bytes);
    Ok(())
}

/// `REGISTER_COMMAND_APPLICATION` (1) del protocolo v4: versión, nombre de la
/// aplicación, contraseña de conexión, intervalo (i32 LE) y contraseña de
/// comandos.
fn mensaje_registro(
    nombre: &str,
    password_conexion: &str,
    intervalo_ms: u32,
) -> io::Result<Vec<u8>> {
    let mut mensaje = vec![MSG_REGISTRO, PROTOCOLO_VERSION];
    escribir_cadena(&mut mensaje, nombre)?;
    escribir_cadena(&mut mensaje, password_conexion)?;
    mensaje.extend_from_slice(&intervalo_ms.to_le_bytes());
    mensaje.extend_from_slice(&0_u16.to_le_bytes()); // Sin contraseña de comandos.
    Ok(mensaje)
}

/// UNREGISTER v4 solo lleva tipo; las peticiones de lista/pista añaden connectionId.
fn mensaje_conexion(tipo: u8, conexion: i32) -> Vec<u8> {
    let mut mensaje = vec![tipo];
    if tipo != MSG_DESREGISTRO {
        mensaje.extend_from_slice(&conexion.to_le_bytes());
    }
    mensaje
}

/// `REGISTRATION_RESULT` interpretado.
#[derive(Debug, PartialEq, Eq)]
struct ResultadoRegistro {
    conexion: i32,
    exito: bool,
    solo_lectura: bool,
}

/// `REGISTRATION_RESULT` (1): connectionId (i32 LE), success (u8), isReadonly
/// (u8) y el error como cadena. `None` si no es ese mensaje o viene truncado.
fn parsear_registro(datos: &[u8]) -> Option<ResultadoRegistro> {
    let h = datos.get(..9)?;
    let longitud = usize::from(u16::from_le_bytes([h[7], h[8]]));
    if h[0] != RESULTADO_REGISTRO || datos.len() != 9 + longitud {
        return None;
    }
    // Validar el texto sin conservarlo ni mostrarlo: puede incluir credenciales.
    std::str::from_utf8(&datos[9..]).ok()?;
    Some(ResultadoRegistro {
        conexion: i32::from_le_bytes([h[1], h[2], h[3], h[4]]),
        exito: h[5] > 0,
        solo_lectura: h[6] == 0, // SDK: 0 significa read-only.
    })
}

// ---------------------------------------------------------------------------
// Registros de los ficheros
// ---------------------------------------------------------------------------

/// Registro de `shm.bin`: `[u8 kind][u32 packetId LE][u64 t_rel_ns LE][blob]`.
fn escribir_shm(
    salida: &mut impl Write,
    kind: u8,
    packet_id: u32,
    t_rel_ns: u64,
    blob: &[u8],
) -> io::Result<()> {
    salida.write_all(&[kind])?;
    salida.write_all(&packet_id.to_le_bytes())?;
    salida.write_all(&t_rel_ns.to_le_bytes())?;
    salida.write_all(blob)
}

/// Registro de `udp.bin`: `[u32 len LE][u64 t_rel_ns LE][datagrama]`.
fn escribir_udp(salida: &mut impl Write, t_rel_ns: u64, datagrama: &[u8]) -> io::Result<()> {
    let longitud = u32::try_from(datagrama.len()).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "datagrama mayor que 4 GiB (imposible en UDP)",
        )
    })?;
    salida.write_all(&longitud.to_le_bytes())?;
    salida.write_all(&t_rel_ns.to_le_bytes())?;
    salida.write_all(datagrama)
}

// ---------------------------------------------------------------------------
// Fecha, SHA-256 y manifiesto
// ---------------------------------------------------------------------------

/// Fecha UTC del instante: ISO-8601 para el manifiesto y compacta
/// (`AAAAMMDD-hhmmss`) para el nombre del paquete.
fn fecha_utc(instante: SystemTime) -> (String, String) {
    let segundos = instante
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duracion| duracion.as_secs());
    let dias = i64::try_from(segundos / 86_400).unwrap_or(i64::MAX);
    let resto = segundos % 86_400;
    let (ano, mes, dia) = fecha_desde_dias(dias);
    let (hora, minuto, segundo) = (resto / 3_600, resto % 3_600 / 60, resto % 60);
    (
        format!("{ano:04}-{mes:02}-{dia:02}T{hora:02}:{minuto:02}:{segundo:02}Z"),
        format!("{ano:04}{mes:02}{dia:02}-{hora:02}{minuto:02}{segundo:02}"),
    )
}

/// Días desde 1970-01-01 al (año, mes, día) del calendario gregoriano
/// proleptico (algoritmo `civil_from_days` de Howard Hinnant).
fn fecha_desde_dias(dias: i64) -> (i64, u64, u64) {
    let dias = dias + 719_468;
    let era = dias.div_euclid(146_097);
    let dia_de_era = dias.rem_euclid(146_097);
    let ano_de_era =
        (dia_de_era - dia_de_era / 1_460 + dia_de_era / 36_524 - dia_de_era / 146_096) / 365;
    let ano = ano_de_era + era * 400;
    let dia_del_ano = dia_de_era - (365 * ano_de_era + ano_de_era / 4 - ano_de_era / 100);
    let mes_aproximado = (5 * dia_del_ano + 2) / 153;
    let dia = dia_del_ano - (153 * mes_aproximado + 2) / 5 + 1;
    let mes = if mes_aproximado < 10 {
        mes_aproximado + 3
    } else {
        mes_aproximado - 9
    };
    let ano = if mes <= 2 { ano + 1 } else { ano };
    (
        ano,
        u64::try_from(mes).unwrap_or(1),
        u64::try_from(dia).unwrap_or(1),
    )
}

/// Hexadecimal en minúsculas.
fn hex(bytes: &[u8]) -> String {
    const DIGITOS: &[u8; 16] = b"0123456789abcdef";
    let mut texto = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        texto.push(char::from(DIGITOS[usize::from(byte >> 4)]));
        texto.push(char::from(DIGITOS[usize::from(byte & 0x0f)]));
    }
    texto
}

/// SHA-256 en hexadecimal del fichero, leído por bloques.
fn sha256_fichero(ruta: &Path) -> io::Result<String> {
    let mut fichero = File::open(ruta)?;
    let mut hasher = Sha256::new();
    let mut bloque = vec![0_u8; 64 * 1024];
    loop {
        let leidos = fichero.read(&mut bloque)?;
        if leidos == 0 {
            break;
        }
        hasher.update(&bloque[..leidos]);
    }
    Ok(hex(&hasher.finalize()[..]))
}

/// Recuento de eventos capturados por fuente.
#[derive(Debug, Default, Clone, Copy)]
struct Contadores {
    physics: u64,
    graphics: u64,
    estaticos: u64,
    udp: u64,
}

impl Contadores {
    fn delta(self, anterior: Self) -> Self {
        Self {
            physics: self.physics.saturating_sub(anterior.physics),
            graphics: self.graphics.saturating_sub(anterior.graphics),
            estaticos: self.estaticos.saturating_sub(anterior.estaticos),
            udp: self.udp.saturating_sub(anterior.udp),
        }
    }

    fn total(self) -> u64 {
        self.physics + self.graphics + self.estaticos + self.udp
    }
}

/// Datos que resumen la grabación y alimentan el manifiesto.
struct Resumen {
    ac_version: String,
    sm_version: String,
    pista: String,
    tipo: String,
    fecha: String,
    duracion_s: f64,
    contadores: Contadores,
    sha256_shm: String,
    sha256_udp: String,
}

/// Manifiesto `vantare.acc-temporal-v1` de la captura.
fn manifiesto(resumen: &Resumen) -> Value {
    json!({
        "schema": ESQUEMA,
        "acVersion": resumen.ac_version,
        "smVersion": resumen.sm_version,
        "pista": resumen.pista,
        "tipo": resumen.tipo,
        "fecha": resumen.fecha,
        "duracion_s": resumen.duracion_s,
        "eventos": {
            "physics": resumen.contadores.physics,
            "graphics": resumen.contadores.graphics,
            "static": resumen.contadores.estaticos,
            "udp": resumen.contadores.udp,
        },
        "sha256": {
            "shm.bin": resumen.sha256_shm,
            "udp.bin": resumen.sha256_udp,
        },
    })
}

// ---------------------------------------------------------------------------
// Nombre de fichero y paquete tar.gz
// ---------------------------------------------------------------------------

/// Nombre de fichero seguro: ASCII alfanumérico y guiones simples, sin
/// guiones en los extremos.
fn sanear(texto: &str) -> String {
    let mut limpio = String::new();
    for caracter in texto.chars() {
        if caracter.is_ascii_alphanumeric() {
            limpio.push(caracter);
        } else if !limpio.is_empty() && !limpio.ends_with('-') {
            limpio.push('-');
        }
    }
    while limpio.ends_with('-') {
        limpio.pop();
    }
    if limpio.is_empty() {
        "desconocida".into()
    } else {
        limpio
    }
}

/// Campo numérico octal del tar, justificado a la derecha con NUL final.
///
/// Devuelve error si el valor no cabe: envolverlo en silencio dejaba el
/// `corpus.tar.gz` corrupto sin avisar. Su gemelo de LMU
/// (`grabar-lmu/implementation.rs:360`) ya falla cerrado.
fn campo_octal(campo: &mut [u8], valor: u64) -> io::Result<()> {
    campo[campo.len() - 1] = 0;
    let mut resto = valor;
    for posicion in (0..campo.len() - 1).rev() {
        campo[posicion] = b'0' + u8::try_from(resto % 8).unwrap_or(0);
        resto /= 8;
    }
    if resto != 0 {
        return Err(io::Error::other("campo ustar fuera de rango"));
    }
    Ok(())
}

/// El campo de checksum del tar son 6 dígitos octales + NUL + espacio.
fn escribir_checksum(campo: &mut [u8], valor: u64) {
    campo[6] = 0;
    campo[7] = b' ';
    let mut resto = valor;
    for posicion in (0..6).rev() {
        campo[posicion] = b'0' + u8::try_from(resto % 8).unwrap_or(0);
        resto /= 8;
    }
}

/// Empaqueta los ficheros en un `.tar.gz` (ustar clásico + gzip de `flate2`),
/// sin dependencias nuevas. `entradas` es (nombre dentro del paquete, ruta).
fn empaquetar(destino: &Path, entradas: &[(&str, &Path)]) -> io::Result<()> {
    let mut gzip = GzEncoder::new(BufWriter::new(File::create(destino)?), Compression::fast());
    for (nombre, ruta) in entradas {
        let metadatos = fs::metadata(ruta)?;
        let tamano = metadatos.len();
        let modificado = metadatos
            .modified()
            .ok()
            .and_then(|instante| instante.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |duracion| duracion.as_secs());
        let nombre_bytes = nombre.as_bytes();
        if nombre_bytes.is_empty() || nombre_bytes.len() > 100 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("nombre de tar no válido: {nombre}"),
            ));
        }
        let mut cabecera = [0_u8; 512];
        cabecera[..nombre_bytes.len()].copy_from_slice(nombre_bytes);
        campo_octal(&mut cabecera[100..108], 0o644)?;
        campo_octal(&mut cabecera[108..116], 0)?;
        campo_octal(&mut cabecera[116..124], 0)?;
        campo_octal(&mut cabecera[124..136], tamano)?;
        campo_octal(&mut cabecera[136..148], modificado)?;
        cabecera[156] = b'0'; // fichero regular
        cabecera[257..263].copy_from_slice(b"ustar\0");
        cabecera[263..265].copy_from_slice(b"00");
        cabecera[148..156].fill(b' ');
        // El checksum máximo (cabecera entera a 0xFF) es 130 560: cabe de sobra
        // en los 6 dígitos octales del campo.
        let suma: u64 = cabecera.iter().map(|byte| u64::from(*byte)).sum();
        escribir_checksum(&mut cabecera[148..156], suma);
        gzip.write_all(&cabecera)?;
        let mut contenido = BufReader::new(File::open(ruta)?);
        io::copy(&mut contenido, &mut gzip)?;
        let relleno = tamano.div_ceil(512) * 512 - tamano;
        let relleno = usize::try_from(relleno).map_err(|_| {
            io::Error::new(io::ErrorKind::InvalidData, "relleno del tar fuera de rango")
        })?;
        if relleno > 0 {
            gzip.write_all(&[0_u8; 512][..relleno])?;
        }
    }
    gzip.write_all(&[0_u8; 1024])?;
    gzip.finish()?.flush()
}

// ---------------------------------------------------------------------------
// Windows: memoria compartida y feed UDP
// ---------------------------------------------------------------------------

/// Sube la resolución del temporizador para muestrear a ~1 kHz y la restaura al
/// soltarse.
#[cfg(windows)]
struct PeriodoFino(u32);

#[cfg(windows)]
impl PeriodoFino {
    fn activar(milisegundos: u32) -> Self {
        // SAFETY: `timeBeginPeriod` solo ajusta el temporizador del sistema;
        // `Drop` lo compensa con el mismo periodo.
        unsafe { timeBeginPeriod(milisegundos) };
        Self(milisegundos)
    }
}

#[cfg(windows)]
impl Drop for PeriodoFino {
    fn drop(&mut self) {
        // SAFETY: empareja el `timeBeginPeriod` de `activar`.
        unsafe { timeEndPeriod(self.0) };
    }
}

// winmm: resolución del temporizador del sistema; las dos llamadas van con su
// comentario `SAFETY` en `PeriodoFino`.
#[cfg(windows)]
#[link(name = "winmm")]
unsafe extern "system" {
    fn timeBeginPeriod(periodo: u32) -> u32;
    fn timeEndPeriod(periodo: u32) -> u32;
}

/// Vista de solo lectura de una página de ACC, con dueño único del handle.
#[cfg(windows)]
struct Pagina {
    _dueno: std::os::windows::io::OwnedHandle,
    vista: std::ptr::NonNull<u8>,
    tamano: usize,
}

#[cfg(windows)]
impl Pagina {
    /// Abre `nombre` para lectura y mapea exactamente `tamano` bytes: si la
    /// página del juego es menor, falla antes de que nadie lea fuera de ella.
    fn abrir(nombre: &str, tamano: usize) -> io::Result<Self> {
        use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
        use windows_sys::Win32::System::Memory::{FILE_MAP_READ, MapViewOfFile, OpenFileMappingW};

        let ancho: Vec<u16> = nombre.encode_utf16().chain([0]).collect();
        // SAFETY: `ancho` termina en NUL y vive durante la llamada; solo se pide
        // lectura y el handle no se hereda.
        let handle = unsafe { OpenFileMappingW(FILE_MAP_READ, 0, ancho.as_ptr()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: el handle acaba de abrirse y esta `Pagina` será su único dueño.
        let dueno = unsafe { OwnedHandle::from_raw_handle(handle) };
        // SAFETY: el handle es válido y la vista se desmapea en `Drop`.
        let vista = unsafe { MapViewOfFile(dueno.as_raw_handle(), FILE_MAP_READ, 0, 0, tamano) };
        let Some(vista) = std::ptr::NonNull::new(vista.Value.cast::<u8>()) else {
            return Err(io::Error::last_os_error());
        };
        Ok(Self {
            _dueno: dueno,
            vista,
            tamano,
        })
    }

    /// `packetId` de la página (primeros 4 bytes, entero nativo little-endian).
    fn leer_packet_id(&self) -> u32 {
        let mut bytes = [0; 4];
        for (i, byte) in bytes.iter_mut().enumerate() {
            // SAFETY: mapping Win32 vivo de al menos 800 B; i < 4.
            *byte = unsafe { self.vista.as_ptr().add(i).read_volatile() };
        }
        u32::from_le_bytes(bytes)
    }

    fn copiar(&self, destino: &mut [u8]) -> io::Result<()> {
        if destino.len() != self.tamano {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "búfer de tamaño distinto a la página",
            ));
        }
        for (i, byte) in destino.iter_mut().enumerate() {
            // SAFETY: mapping Win32 vivo de tamano bytes; destino mide tamano.
            // Volátil ante escritor externo; copia_estable descarta rasgados.
            *byte = unsafe { self.vista.as_ptr().add(i).read_volatile() };
        }
        Ok(())
    }
}

#[cfg(windows)]
impl Drop for Pagina {
    fn drop(&mut self) {
        use windows_sys::Win32::System::Memory::{MEMORY_MAPPED_VIEW_ADDRESS, UnmapViewOfFile};
        // SAFETY: la vista es de esta `Pagina` y nadie la usa ya; el handle se
        // cierra después, al soltar `_dueno`.
        unsafe {
            UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS {
                Value: self.vista.as_ptr().cast(),
            });
        }
    }
}

/// Las tres páginas de ACC y el último `packetId` volcado de cada una.
#[cfg(windows)]
#[derive(Default)]
struct Paginas {
    physics: Option<Pagina>,
    graphics: Option<Pagina>,
    estatico: Option<Pagina>,
    ultimo_physics: Option<u32>,
    ultimo_graphics: Option<u32>,
}

#[cfg(windows)]
impl Paginas {
    fn pagina(&mut self, indice: usize) -> &mut Option<Pagina> {
        match indice {
            0 => &mut self.physics,
            1 => &mut self.graphics,
            _ => &mut self.estatico,
        }
    }
}

/// Impresiones que no deben repetirse en cada vuelta.
#[cfg(windows)]
#[derive(Default)]
struct Avisos {
    esperando: Option<Instant>,
    registrado: Option<i32>,
    rechazo: bool,
}

/// Configuración del listener de broadcasting de ACC.
#[derive(Debug, PartialEq, Eq)]
struct ConfigBroadcasting {
    puerto: u16,
    password_conexion: String,
}

/// Texto UTF-16LE (BOM `FF FE`, o segundo byte nulo como en `{` + `\0`) pasado a
/// UTF-8; cualquier otra cosa se devuelve tal cual.
fn utf8(bytes: &[u8]) -> io::Result<Vec<u8>> {
    let utf16 = bytes.starts_with(&[0xFF, 0xFE]) || bytes.get(1) == Some(&0);
    if !utf16 {
        return Ok(bytes.to_vec());
    }
    if !bytes.len().is_multiple_of(2) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "UTF-16 truncado",
        ));
    }
    let unidades: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|par| u16::from_le_bytes([par[0], par[1]]))
        .collect();
    Ok(String::from_utf16(&unidades)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "UTF-16 inválido"))?
        .trim_start_matches('\u{feff}')
        .as_bytes()
        .to_vec())
}

/// Tope de `broadcasting.json`: es una configuracion diminuta.
const MAX_CONFIG_BYTES: u64 = 1024 * 1024;

fn read_bounded(ruta: &Path) -> io::Result<Vec<u8>> {
    use std::io::Read;
    let fichero = fs::File::open(ruta)?;
    let mut bytes = Vec::new();
    fichero.take(MAX_CONFIG_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err(io::Error::other("configuracion de ACC demasiado grande"));
    }
    Ok(bytes)
}

/// Lee `broadcasting.json`. ACC ha usado las dos grafías del puerto
/// (`udpListenerPort` en las builds nuevas y la errata `updListenerPort`), así
/// que se aceptan ambas. `Ok(None)` si el fichero no existe.
fn config_broadcasting(ruta: &Path) -> io::Result<Option<ConfigBroadcasting>> {
    // Lectura acotada: el replay de ACC ya la tiene y esta ruta la controla el
    // contenido del perfil del usuario.
    let contenido = match read_bounded(ruta) {
        Ok(contenido) => contenido,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    // ACC lo escribe en UTF-16LE (con o sin BOM) y a veces en UTF-8 con BOM;
    // lo deja vacío mientras el broadcasting no está configurado.
    let contenido = utf8(&contenido)?;
    let contenido = contenido
        .strip_prefix([0xEF, 0xBB, 0xBF].as_slice())
        .unwrap_or(&contenido);
    if contenido.iter().all(u8::is_ascii_whitespace) {
        return Ok(None);
    }
    let valor: Value = serde_json::from_slice(contenido).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "broadcasting.json no es JSON válido",
        )
    })?;
    let puerto = ["udpListenerPort", "updListenerPort"]
        .iter()
        .find_map(|clave| valor.get(*clave).and_then(Value::as_u64))
        .and_then(|puerto| u16::try_from(puerto).ok())
        .filter(|puerto| *puerto > 0)
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "broadcasting.json sin udpListenerPort/updListenerPort válido",
            )
        })?;
    let texto = |clave: &str| {
        valor
            .get(clave)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned()
    };
    Ok(Some(ConfigBroadcasting {
        puerto,
        password_conexion: texto("connectionPassword"),
    }))
}

/// Cliente del feed UDP: registra la aplicación, pide lista y pista y vuelca
/// cada datagrama, incluido `REGISTRATION_RESULT`.
#[cfg(windows)]
struct FuenteUdp {
    socket: UdpSocket,
    destino: std::net::SocketAddr,
    password_conexion: String,
    conexion: Option<i32>,
    proximo_registro: Instant,
    ultima_senal: Instant,
    bufer: Vec<u8>,
}

#[cfg(windows)]
impl FuenteUdp {
    fn nuevo(config: &ConfigBroadcasting) -> io::Result<Self> {
        let socket = UdpSocket::bind("127.0.0.1:0")?;
        socket.set_nonblocking(true)?;
        let destino = format!("127.0.0.1:{}", config.puerto)
            .parse()
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
        let ahora = Instant::now();
        Ok(Self {
            socket,
            destino,
            password_conexion: config.password_conexion.clone(),
            conexion: None,
            proximo_registro: ahora,
            ultima_senal: ahora,
            bufer: vec![0_u8; 65_535],
        })
    }

    /// Envía sin ruido: que ACC no escuche (juego cerrado o en carga) no debe
    /// matar la grabación de la memoria compartida.
    fn enviar(&self, datos: &[u8]) {
        if let Err(error) = self.socket.send_to(datos, self.destino) {
            eprintln!("broadcasting: no se pudo enviar: {error}");
        }
    }

    fn enviar_registro(&mut self) {
        match mensaje_registro(NOMBRE_APP, &self.password_conexion, INTERVALO_MS) {
            Ok(mensaje) => self.enviar(&mensaje),
            Err(error) => eprintln!("broadcasting: {error}"),
        }
        // Enviar no es recibir: no rejuvenece la última muestra del feed.
        self.proximo_registro = Instant::now() + REINTENTO_REGISTRO;
    }

    /// Drena el socket, guarda cada datagrama e interpreta el resultado del
    /// registro. Reintenta el registro cada 2 s hasta que ACC conteste, y si
    /// deja de llegar tráfico (ACC reiniciado) vuelve a registrarse.
    fn atender(
        &mut self,
        salida: &mut impl Write,
        contadores: &mut Contadores,
        inicio: Instant,
        avisos: &mut Avisos,
    ) -> io::Result<()> {
        for _ in 0..256 {
            match self.socket.recv_from(&mut self.bufer) {
                Ok((leidos, peer)) if peer == self.destino => {
                    escribir_udp(salida, t_rel_ns(inicio), &self.bufer[..leidos])?;
                    contadores.udp += 1;
                    self.ultima_senal = Instant::now();
                    if let Some(resultado) = parsear_registro(&self.bufer[..leidos]) {
                        self.procesar(&resultado, avisos);
                    }
                }
                Ok(_) => {} // Un peer ajeno no entra en el corpus ni refresca el feed.
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => break,
                // Un ICMP de "puerto cerrado" (ACC apagado) no debe matar la
                // grabación; se trata como silencio.
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::ConnectionReset | io::ErrorKind::ConnectionRefused
                    ) =>
                {
                    break;
                }
                Err(error) => return Err(error),
            }
        }
        let ahora = Instant::now();
        if self.conexion.is_some() {
            // Registrado y con tráfico: nada que hacer. Solo un silencio
            // (ACC reiniciado) obliga a registrarse de nuevo.
            if self.ultima_senal.elapsed() < SILENCIO_CONEXION {
                return Ok(());
            }
            self.cerrar();
            self.conexion = None;
            self.proximo_registro = ahora;
        }
        if ahora >= self.proximo_registro {
            self.enviar_registro();
        }
        Ok(())
    }

    fn procesar(&mut self, resultado: &ResultadoRegistro, avisos: &mut Avisos) {
        if !resultado.exito {
            self.conexion = None;
            if !avisos.rechazo {
                eprintln!("broadcasting: ACC rechazó el registro; revisar configuración local");
                avisos.rechazo = true;
            }
            return;
        }
        // UNREGISTER identifica el endpoint, no un ID. No retirarlo después
        // del ACK nuevo: cancelaría también la suscripción recién admitida.
        self.conexion = Some(resultado.conexion);
        if avisos.registrado != Some(resultado.conexion) {
            println!(
                "broadcasting: registrado (conexión {}{})",
                resultado.conexion,
                if resultado.solo_lectura {
                    ", solo lectura"
                } else {
                    ""
                }
            );
            avisos.registrado = Some(resultado.conexion);
            avisos.rechazo = false;
        }
        self.enviar(&mensaje_conexion(MSG_PEDIR_LISTA, resultado.conexion));
        self.enviar(&mensaje_conexion(MSG_PEDIR_PISTA, resultado.conexion));
    }

    /// Se retira ante ACC al cerrar (mejor esfuerzo).
    fn cerrar(&self) {
        if let Some(conexion) = self.conexion {
            self.enviar(&mensaje_conexion(MSG_DESREGISTRO, conexion));
        }
    }
}

/// Carpeta Documentos del usuario (Carpetas conocidas de Windows, que respeta
/// la redirección a `OneDrive`), con `%USERPROFILE%\Documents` como reserva.
#[cfg(windows)]
fn carpeta_documentos() -> io::Result<PathBuf> {
    use windows_sys::Win32::System::Com::CoTaskMemFree;
    use windows_sys::Win32::UI::Shell::{FOLDERID_Documents, SHGetKnownFolderPath};

    let mut puntero: windows_sys::core::PWSTR = std::ptr::null_mut();
    // SAFETY: la API devuelve un puntero que se libera con `CoTaskMemFree`; se
    // pide la carpeta del usuario actual, sin banderas.
    let resultado = unsafe {
        SHGetKnownFolderPath(
            &FOLDERID_Documents,
            0,
            std::ptr::null_mut(),
            &raw mut puntero,
        )
    };
    if resultado >= 0 && !puntero.is_null() {
        // SAFETY: cadena UTF-16 terminada en NUL propiedad del shell.
        let ruta = unsafe { cadena_utf16_propia(puntero) };
        // SAFETY: memoria devuelta por `SHGetKnownFolderPath`, aún sin liberar.
        unsafe { CoTaskMemFree(puntero.cast()) };
        return Ok(PathBuf::from(ruta));
    }
    std::env::var_os("USERPROFILE")
        .map(|perfil| PathBuf::from(perfil).join("Documents"))
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "no se pudo localizar la carpeta Documentos",
            )
        })
}

/// Copia una cadena UTF-16 terminada en NUL que devuelve Windows.
///
/// # Safety
/// `puntero` debe apuntar a una cadena UTF-16 terminada en NUL válida.
#[cfg(windows)]
unsafe fn cadena_utf16_propia(puntero: *const u16) -> String {
    let mut longitud = 0_usize;
    // SAFETY: se avanza mientras no aparezca el terminador que garantiza el
    // contrato de esta función.
    while unsafe { *puntero.add(longitud) } != 0 {
        longitud += 1;
    }
    // SAFETY: las `longitud` unidades comprobadas son legibles.
    let unidades = unsafe { std::slice::from_raw_parts(puntero, longitud) };
    String::from_utf16_lossy(unidades)
}

/// Prepara el feed UDP. Sin `broadcasting.json` (o ilegible) imprime cómo
/// habilitarlo y devuelve `None`: la grabación sigue solo con la memoria
/// compartida.
#[cfg(windows)]
fn preparar_broadcasting() -> Option<FuenteUdp> {
    let base = match carpeta_documentos() {
        Ok(base) => base,
        Err(error) => {
            eprintln!("broadcasting: {error}; sigo solo con la memoria compartida.");
            return None;
        }
    };
    let ruta = base
        .join("Assetto Corsa Competizione")
        .join("Config")
        .join("broadcasting.json");
    match config_broadcasting(&ruta) {
        Ok(Some(config)) => match FuenteUdp::nuevo(&config) {
            Ok(fuente) => {
                println!(
                    "broadcasting: {} (puerto UDP {}); registrando…",
                    ruta.display(),
                    config.puerto
                );
                Some(fuente)
            }
            Err(error) => {
                eprintln!("broadcasting: no se pudo abrir el socket: {error}");
                None
            }
        },
        Ok(None) => {
            println!(
                "broadcasting: {} no está configurado (no existe o está vacío)",
                ruta.display()
            );
            println!("  sigo solo con la memoria compartida. Para capturarlo también:");
            println!(
                "  en ACC, activa «broadcasting» en los ajustes de la sesión y reinicia el juego,"
            );
            println!("  o crea ese fichero con el puerto y las contraseñas:");
            println!(
                "  {{\"updListenerPort\": 9000, \"connectionPassword\": \"clave\", \"commandPassword\": \"\"}}"
            );
            None
        }
        Err(error) => {
            eprintln!("broadcasting: {error}; sigo solo con la memoria compartida.");
            None
        }
    }
}

/// Tiempo transcurrido desde el inicio de la grabación (ns).
#[cfg(windows)]
fn t_rel_ns(inicio: Instant) -> u64 {
    u64::try_from(inicio.elapsed().as_nanos()).unwrap_or(u64::MAX)
}

#[cfg(windows)]
fn plazo_agotado(segundos: Option<u64>, inicio: Instant) -> bool {
    segundos.is_some_and(|segundos| inicio.elapsed() >= Duration::from_secs(segundos))
}

/// Versiona la página `static`: `(acVersion, smVersion)`.
fn versiones_del_estatico(estatico: &[u8]) -> (String, String) {
    (
        cadena_utf16(estatico.get(30..60).unwrap_or_default()),
        cadena_utf16(estatico.get(0..30).unwrap_or_default()),
    )
}

/// Cadena UTF-16 de bytes little-endian, cortada en el primer NUL.
fn cadena_utf16(bytes: &[u8]) -> String {
    let unidades: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|par| u16::from_le_bytes([par[0], par[1]]))
        .take_while(|unidad| *unidad != 0)
        .collect();
    String::from_utf16_lossy(&unidades)
}

/// Estado de la grabación: escritores, páginas, búferes y contadores.
#[cfg(windows)]
struct Grabadora {
    shm: BufWriter<File>,
    udp: BufWriter<File>,
    paginas: Paginas,
    contadores: Contadores,
    ac_version: String,
    sm_version: String,
    bufer_physics: Vec<u8>,
    bufer_graphics: Vec<u8>,
    estatico_actual: Vec<u8>,
    estatico_scratch: Vec<u8>,
    /// Última copia de `static` volcada; `None` hasta la primera lectura.
    estatico_ultimo: Option<Vec<u8>>,
    estatico_packet_id: u32,
}

#[cfg(windows)]
impl Grabadora {
    fn nuevo(dir: &Path) -> io::Result<Self> {
        Ok(Self {
            shm: BufWriter::with_capacity(64 * 1024, File::create(dir.join("shm.bin"))?),
            udp: BufWriter::with_capacity(8 * 1024, File::create(dir.join("udp.bin"))?),
            paginas: Paginas::default(),
            contadores: Contadores::default(),
            ac_version: String::new(),
            sm_version: String::new(),
            bufer_physics: vec![0_u8; TAM_PHYSICS],
            bufer_graphics: vec![0_u8; TAM_GRAPHICS],
            estatico_actual: vec![0_u8; TAM_STATIC],
            estatico_scratch: vec![0_u8; TAM_STATIC],
            estatico_ultimo: None,
            estatico_packet_id: 0,
        })
    }

    /// Abre las páginas que falten; que ACC esté cerrado o cargando no es un
    /// error: se reintenta en cada llamada.
    fn abrir_pendientes(&mut self, avisos: &mut Avisos) {
        const PAGINAS: [(&str, usize); 3] = [
            (NOMBRE_PHYSICS, TAM_PHYSICS),
            (NOMBRE_GRAPHICS, TAM_GRAPHICS),
            (NOMBRE_STATIC, TAM_STATIC),
        ];
        for (indice, (nombre, tamano)) in PAGINAS.iter().enumerate() {
            if self.paginas.pagina(indice).is_some() {
                continue;
            }
            let Ok(pagina) = Pagina::abrir(nombre, *tamano) else {
                continue;
            };
            println!("memoria compartida: {nombre} conectada ({tamano} B)");
            *self.paginas.pagina(indice) = Some(pagina);
        }
        let faltan = (0..PAGINAS.len())
            .filter(|indice| self.paginas.pagina(*indice).is_none())
            .count();
        if faltan > 0
            && avisos
                .esperando
                .is_none_or(|instante| instante.elapsed() >= Duration::from_secs(10))
        {
            println!(
                "memoria compartida: esperando a ACC ({faltan} página(s) sin abrir; \
                 se reintenta cada segundo)…"
            );
            avisos.esperando = Some(Instant::now());
        }
    }

    /// Una vuelta de lectura de `physics` y `graphics`: cada `packetId` nuevo
    /// se vuelca a `shm.bin`.
    fn capturar_frames(&mut self, t_rel_ns: u64) -> io::Result<()> {
        capturar_frame(
            &mut self.shm,
            self.paginas.physics.as_ref(),
            &mut self.bufer_physics,
            &mut self.paginas.ultimo_physics,
            KIND_PHYSICS,
            t_rel_ns,
            &mut self.contadores.physics,
        )?;
        capturar_frame(
            &mut self.shm,
            self.paginas.graphics.as_ref(),
            &mut self.bufer_graphics,
            &mut self.paginas.ultimo_graphics,
            KIND_GRAPHICS,
            t_rel_ns,
            &mut self.contadores.graphics,
        )
    }

    /// `static` cambia poco: se lee una vez por segundo y solo se vuelca si
    /// difiere de la última copia escrita.
    fn capturar_estatico(&mut self, t_rel_ns: u64) -> io::Result<()> {
        let Some(pagina) = self.paginas.estatico.as_ref() else {
            return Ok(());
        };
        let lectura = copia_estable_por_igualdad(
            &mut self.estatico_actual,
            &mut self.estatico_scratch,
            |destino| pagina.copiar(destino),
        );
        match lectura {
            Ok(()) => {
                // La primera lectura siempre se vuelca; después, solo si cambió.
                if self.estatico_ultimo.as_deref() != Some(self.estatico_actual.as_slice()) {
                    escribir_shm(
                        &mut self.shm,
                        KIND_STATIC,
                        self.estatico_packet_id,
                        t_rel_ns,
                        &self.estatico_actual,
                    )?;
                    self.estatico_packet_id = self.estatico_packet_id.wrapping_add(1);
                    self.estatico_ultimo = Some(self.estatico_actual.clone());
                    self.contadores.estaticos += 1;
                    self.actualizar_versiones();
                }
                Ok(())
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => Ok(()),
            Err(error) => Err(error),
        }
    }

    fn actualizar_versiones(&mut self) {
        let (ac_version, sm_version) = versiones_del_estatico(&self.estatico_actual);
        let mut cambio = false;
        if !ac_version.is_empty() && ac_version != self.ac_version {
            self.ac_version = ac_version;
            cambio = true;
        }
        if !sm_version.is_empty() && sm_version != self.sm_version {
            self.sm_version = sm_version;
            cambio = true;
        }
        if cambio {
            println!(
                "ACC: acVersion «{}» · smVersion «{}»",
                self.ac_version, self.sm_version
            );
        }
    }

    /// Vuelca los búferes antes de calcular hashes y empaquetar.
    fn volcar(&mut self) -> io::Result<()> {
        self.shm.flush()?;
        self.udp.flush()
    }
}

/// Un frame: copia estable y, si el `packetId` es nuevo, registro en `shm.bin`.
#[cfg(windows)]
fn capturar_frame(
    salida: &mut impl Write,
    pagina: Option<&Pagina>,
    bufer: &mut [u8],
    ultimo: &mut Option<u32>,
    kind: u8,
    t_rel_ns: u64,
    contador: &mut u64,
) -> io::Result<()> {
    let Some(pagina) = pagina else {
        return Ok(());
    };
    match copia_estable(
        bufer,
        || pagina.leer_packet_id(),
        |destino| pagina.copiar(destino),
    ) {
        Ok(packet_id) => {
            if Some(packet_id) != *ultimo {
                escribir_shm(salida, kind, packet_id, t_rel_ns, bufer)?;
                *ultimo = Some(packet_id);
                *contador += 1;
            }
            Ok(())
        }
        // Rasgada en todos los intentos: se descarta y se reintenta en la
        // siguiente vuelta.
        Err(error) if error.kind() == io::ErrorKind::WouldBlock => Ok(()),
        Err(error) => Err(error),
    }
}

/// Línea de estado: eventos por segundo de cada fuente.
#[cfg(windows)]
fn imprimir_ritmo(segundos: u64, delta: &Contadores, fuente: Option<&FuenteUdp>) {
    let shm = delta.physics + delta.graphics + delta.estaticos;
    let udp = match fuente {
        None => "sin broadcasting".to_owned(),
        Some(fuente) => match fuente.conexion {
            Some(conexion) => format!("{} ev/s, conexión {conexion}", delta.udp),
            None => format!("{} ev/s, sin registro", delta.udp),
        },
    };
    println!(
        "[{segundos:>4} s] memoria compartida {shm} ev/s \
         (physics {}, graphics {}, static {}); broadcasting {udp}",
        delta.physics, delta.graphics, delta.estaticos
    );
}

/// Bucle principal: muestrea la memoria compartida a ~1 kHz y atiende el feed
/// UDP hasta Ctrl+C o `--segundos`.
#[cfg(windows)]
fn bucle_captura(
    grabadora: &mut Grabadora,
    fuente: &mut Option<FuenteUdp>,
    parada: &std::sync::atomic::AtomicBool,
    segundos: Option<u64>,
    inicio: Instant,
    avisos: &mut Avisos,
) -> io::Result<()> {
    let mut proxima_apertura = inicio;
    let mut proximo_estatico = inicio;
    let mut proximo_aviso = inicio + Duration::from_secs(1);
    let mut anterior = Contadores::default();
    while !parada.load(Ordering::SeqCst) && !plazo_agotado(segundos, inicio) {
        let ahora = Instant::now();
        let marca = t_rel_ns(inicio);
        if ahora >= proxima_apertura {
            grabadora.abrir_pendientes(avisos);
            proxima_apertura = ahora + Duration::from_secs(1);
        }
        grabadora.capturar_frames(marca)?;
        if ahora >= proximo_estatico {
            grabadora.capturar_estatico(marca)?;
            proximo_estatico = ahora + Duration::from_secs(1);
        }
        if let Some(fuente) = fuente {
            fuente.atender(
                &mut grabadora.udp,
                &mut grabadora.contadores,
                inicio,
                avisos,
            )?;
        }
        if ahora >= proximo_aviso {
            imprimir_ritmo(
                inicio.elapsed().as_secs(),
                &grabadora.contadores.delta(anterior),
                fuente.as_ref(),
            );
            anterior = grabadora.contadores;
            proximo_aviso = ahora + Duration::from_secs(1);
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    Ok(())
}

#[cfg(windows)]
fn anunciar_inicio(dir: &Path, args: &Args) {
    println!("vantare-grabar-acc: grabando en {}", dir.display());
    println!("  pista «{}» · tipo «{}»", args.pista, args.tipo);
    match args.segundos {
        Some(segundos) => println!("  pararé solo a los {segundos} s, o antes con Ctrl+C"),
        None => println!("  para parar: Ctrl+C"),
    }
}

/// Cierra: retira el registro, vuelca, calcula SHA-256, escribe el manifiesto y
/// empaqueta. Si el paquete falla, el directorio queda intacto.
#[cfg(windows)]
fn cerrar_captura(
    mut grabadora: Grabadora,
    fuente: Option<&FuenteUdp>,
    args: &Args,
    dir: &Path,
    fecha_iso: &str,
    fecha_corta: &str,
    inicio: Instant,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(fuente) = fuente {
        fuente.cerrar();
    }
    let duracion_s = inicio.elapsed().as_secs_f64();
    let contadores = grabadora.contadores;
    let (ac_version, sm_version) = (grabadora.ac_version.clone(), grabadora.sm_version.clone());
    grabadora.volcar()?;
    let resumen = Resumen {
        ac_version,
        sm_version,
        pista: args.pista.clone(),
        tipo: args.tipo.clone(),
        fecha: fecha_iso.to_owned(),
        duracion_s,
        contadores,
        sha256_shm: sha256_fichero(&dir.join("shm.bin"))?,
        sha256_udp: sha256_fichero(&dir.join("udp.bin"))?,
    };
    fs::write(
        dir.join("manifest.json"),
        serde_json::to_vec_pretty(&manifiesto(&resumen))?,
    )?;
    println!(
        "fin: {duracion_s:.1} s · physics {} · graphics {} · static {} · udp {}",
        contadores.physics, contadores.graphics, contadores.estaticos, contadores.udp
    );
    if contadores.total() == 0 {
        eprintln!("atención: no se capturó ningún evento (¿ACC estaba cerrado?)");
    }
    let nombre = format!(
        "acc-{}-{}-{fecha_corta}.tar.gz",
        sanear(&args.pista),
        sanear(&args.tipo)
    );
    let carpeta = dir.parent().map_or(PathBuf::from("."), Path::to_path_buf);
    let paquete = carpeta.join(nombre);
    let ficheros = [
        ("shm.bin", dir.join("shm.bin")),
        ("udp.bin", dir.join("udp.bin")),
        ("manifest.json", dir.join("manifest.json")),
    ];
    let entradas: Vec<(&str, &Path)> = ficheros
        .iter()
        .map(|(nombre, ruta)| (*nombre, ruta.as_path()))
        .collect();
    match empaquetar(&paquete, &entradas) {
        Ok(()) => println!("paquete: {}", paquete.display()),
        Err(error) => eprintln!(
            "no se pudo empaquetar ({error}); quedan los ficheros en {}",
            dir.display()
        ),
    }
    println!(
        "manifest.json: sha256 shm.bin {} · udp.bin {}",
        resumen.sha256_shm, resumen.sha256_udp
    );
    Ok(())
}

#[cfg(windows)]
fn grabar(args: &Args) -> Result<(), Box<dyn std::error::Error>> {
    let parada = vantare_runtime::shutdown::install()?;
    let _periodo = PeriodoFino::activar(1);
    let inicio = Instant::now();
    let (fecha_iso, fecha_corta) = fecha_utc(SystemTime::now());
    let dir = args.salida.clone().unwrap_or_else(|| {
        PathBuf::from(format!(
            "acc-{}-{}-{fecha_corta}",
            sanear(&args.pista),
            sanear(&args.tipo)
        ))
    });
    fs::create_dir_all(&dir)?;
    let mut grabadora = Grabadora::nuevo(&dir)?;
    let mut fuente = preparar_broadcasting();
    let mut avisos = Avisos::default();
    anunciar_inicio(&dir, args);
    bucle_captura(
        &mut grabadora,
        &mut fuente,
        parada,
        args.segundos,
        inicio,
        &mut avisos,
    )?;
    cerrar_captura(
        grabadora,
        fuente.as_ref(),
        args,
        &dir,
        &fecha_iso,
        &fecha_corta,
        inicio,
    )
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

#[cfg(windows)]
pub(super) fn run_cli() -> std::process::ExitCode {
    use std::process::ExitCode;

    let args: Vec<String> = std::env::args().skip(1).collect();
    match parse(&args) {
        Err(mensaje) => {
            eprintln!("{mensaje}\n{USAGE}");
            ExitCode::from(2)
        }
        Ok(args) => match grabar(&args) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("vantare-grabar-acc: {error}");
                ExitCode::FAILURE
            }
        },
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!(
        "vantare-grabar-acc solo funciona en Windows: necesita la memoria compartida \
         y el broadcasting de ACC"
    );
    std::process::exit(1);
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_packet_estable_fuera_del_blob_no_admite_una_copia_distinta() {
        let mut destino = [0; 64];
        let error = copia_estable(
            &mut destino,
            || 17,
            |b| {
                b[..4].copy_from_slice(&18_u32.to_le_bytes());
                Ok(())
            },
        )
        .expect_err("cabecera y blob deben tener el mismo packet");
        assert_eq!(error.kind(), io::ErrorKind::WouldBlock);
    }

    #[cfg(windows)]
    #[test]
    fn silencio_breve_no_renueva_y_silencio_largo_retira_antes_de_registrar() {
        let server = UdpSocket::bind("127.0.0.1:0").expect("servidor vector");
        server
            .set_read_timeout(Some(Duration::from_secs(1)))
            .expect("plazo");
        let config = ConfigBroadcasting {
            puerto: server.local_addr().expect("puerto").port(),
            password_conexion: String::new(),
        };
        let mut fuente = FuenteUdp::nuevo(&config).expect("socket vector");
        fuente.conexion = Some(42);
        let inicio = Instant::now();
        fuente.ultima_senal = inicio
            .checked_sub(Duration::from_secs(3))
            .expect("reloj vector");
        fuente.proximo_registro = inicio;
        let mut out = Vec::new();
        fuente
            .atender(
                &mut out,
                &mut Contadores::default(),
                inicio,
                &mut Avisos::default(),
            )
            .expect("silencio breve");
        server.set_nonblocking(true).expect("sin espera");
        let mut b = [0; 512];
        assert_eq!(
            server
                .recv(&mut b)
                .expect_err("no renovar a los 3 s")
                .kind(),
            io::ErrorKind::WouldBlock
        );
        server.set_nonblocking(false).expect("plazo");
        fuente.ultima_senal = inicio
            .checked_sub(Duration::from_secs(11))
            .expect("reloj vector");
        fuente
            .atender(
                &mut out,
                &mut Contadores::default(),
                inicio,
                &mut Avisos::default(),
            )
            .expect("silencio largo");
        let n = server.recv(&mut b).expect("retirar antes de renovar");
        assert_eq!(&b[..n], &[9]);
        let n = server.recv(&mut b).expect("renovar");
        assert_eq!(&b[..2], &[1, 4]);
        assert!(n > 2);
        assert_eq!(fuente.conexion, None);
    }
    use std::cell::Cell;

    fn parsed(lista: &[&str]) -> Result<Args, String> {
        let args: Vec<String> = lista.iter().map(|texto| (*texto).into()).collect();
        parse(&args)
    }

    /// Carpeta temporal propia de cada prueba (se limpia al empezar).
    fn carpeta_de_prueba(nombre: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "vantare-grabar-acc-{}-{nombre}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("crear carpeta de prueba");
        base
    }

    #[test]
    fn los_argumentos_tienen_valores_por_defecto_y_validan_segundos() {
        let args = parsed(&[]).expect("sin argumentos, todo por defecto");
        assert_eq!(
            args,
            Args {
                salida: None,
                segundos: None,
                pista: "desconocida".into(),
                tipo: "desconocida".into(),
            }
        );
        let args = parsed(&[
            "--salida",
            "capturas/x",
            "--segundos",
            "30",
            "--pista",
            "Spa",
            "--tipo",
            "carrera",
        ])
        .expect("argumentos válidos");
        assert_eq!(args.salida.as_deref(), Some(Path::new("capturas/x")));
        assert_eq!(args.segundos, Some(30));
        assert_eq!(args.pista, "Spa");
        assert_eq!(args.tipo, "carrera");
        for malos in [
            &["--segundos"][..],
            &["--segundos", "0"],
            &["--segundos", "doce"],
            &["--pista"],
            &["--rapido"],
        ] {
            assert!(parsed(malos).is_err(), "{malos:?}");
        }
    }

    #[test]
    fn la_lectura_estable_descarta_las_copias_rasgadas() {
        let mut datos = [7_u8; 64];
        datos[..4].copy_from_slice(&11_u32.to_le_bytes());
        let mut destino = [0_u8; 64];
        // Sin escritor: la primera copia ya es estable.
        let packet_id = copia_estable(
            &mut destino,
            || u32::from_le_bytes([datos[0], datos[1], datos[2], datos[3]]),
            |bufer| {
                bufer.copy_from_slice(&datos);
                Ok(())
            },
        )
        .expect("copia estable");
        assert_eq!(packet_id, 11);
        assert_eq!(destino, datos);

        // El "productor" publica un frame justo en medio de la primera copia:
        // esa copia se descarta y se acepta la siguiente, ya estable.
        let generacion = Cell::new(0_u32);
        let lecturas = Cell::new(0_u32);
        let leer = || generacion.get();
        let mut destino = [0_u8; 64];
        let packet_id = copia_estable(&mut destino, leer, |bufer| {
            lecturas.set(lecturas.get() + 1);
            if lecturas.get() == 1 {
                generacion.set(12);
                datos[..4].copy_from_slice(&12_u32.to_le_bytes());
                datos[8] = 99;
            }
            bufer.copy_from_slice(&datos);
            Ok(())
        })
        .expect("la segunda lectura ya es estable");
        assert_eq!(packet_id, 12);
        assert_eq!(destino[8], 99);

        // Si el productor no para de escribir, se descarta el frame.
        let generacion = Cell::new(0_u32);
        let error = copia_estable(
            &mut destino,
            || generacion.get(),
            |bufer| {
                generacion.set(generacion.get() + 1);
                bufer.copy_from_slice(&datos);
                Ok(())
            },
        )
        .expect_err("nunca se estabiliza");
        assert_eq!(error.kind(), io::ErrorKind::WouldBlock);
    }

    #[test]
    fn la_lectura_estable_por_igualdad_reintenta_hasta_coincidir() {
        let mut destino = [0_u8; 8];
        let mut scratch = [0_u8; 8];
        let escrituras = Cell::new(0_u32);
        let error = copia_estable_por_igualdad(&mut destino, &mut scratch, |bufer| {
            escrituras.set(escrituras.get() + 1);
            bufer[0] = u8::try_from(escrituras.get()).expect("contador pequeño");
            Ok(())
        })
        .expect_err("cada lectura cambia");
        assert_eq!(error.kind(), io::ErrorKind::WouldBlock);

        let primera = Cell::new(true);
        copia_estable_por_igualdad(&mut destino, &mut scratch, |bufer| {
            bufer.copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
            if primera.get() {
                primera.set(false);
                bufer[7] = 9;
            }
            Ok(())
        })
        .expect("la segunda lectura coincide");
        assert_eq!(destino, [1, 2, 3, 4, 5, 6, 7, 8]);
    }

    #[test]
    fn el_registro_v4_coincide_byte_a_byte_con_el_cliente_de_referencia() {
        // Vector del cliente Rust `acbc` (protocol v4), contrastado con el
        // cliente C# de Kunos: tipo, versión, nombre, contraseña, intervalo y
        // contraseña de comandos, con las cadenas prefijadas por u16 LE.
        let esperado: [u8; 24] = [
            0x01, 0x04, 0x09, 0x00, b'Y', b'o', b'u', b'r', b' ', b'n', b'a', b'm', b'e', 0x03,
            0x00, b'a', b's', b'd', 250, 0, 0, 0, 0x00, 0x00,
        ];
        assert_eq!(
            mensaje_registro("Your name", "asd", 250).expect("mensaje válido"),
            esperado
        );
        // Y el que envía la grabadora: 100 ms y «vantare-grabar-acc».
        let mensaje = mensaje_registro(NOMBRE_APP, "clave", INTERVALO_MS).expect("mensaje válido");
        assert_eq!(&mensaje[..2], &[MSG_REGISTRO, PROTOCOLO_VERSION]);
        assert_eq!(&mensaje[2..4], &18_u16.to_le_bytes());
        assert_eq!(&mensaje[4..22], NOMBRE_APP.as_bytes());
        assert_eq!(&mensaje[22..24], &5_u16.to_le_bytes());
        assert_eq!(&mensaje[24..29], b"clave");
        assert_eq!(&mensaje[29..33], &INTERVALO_MS.to_le_bytes());
        assert_eq!(&mensaje[33..], &[0, 0]);
    }

    #[test]
    fn las_peticiones_llevan_tipo_e_identificador_de_conexion() {
        assert_eq!(mensaje_conexion(MSG_DESREGISTRO, 7), vec![0x09]);
        assert_eq!(
            mensaje_conexion(MSG_PEDIR_LISTA, 3),
            vec![0x0A, 0x03, 0, 0, 0]
        );
        assert_eq!(
            mensaje_conexion(MSG_PEDIR_PISTA, -1),
            vec![0x0B, 0xFF, 0xFF, 0xFF, 0xFF]
        );
    }

    #[test]
    fn el_resultado_de_registro_se_interpreta_y_un_mensaje_ajeno_se_ignora() {
        let mut datos = vec![RESULTADO_REGISTRO];
        datos.extend_from_slice(&3_i32.to_le_bytes());
        datos.extend_from_slice(&[1, 0]);
        datos.extend_from_slice(&6_u16.to_le_bytes());
        datos.extend_from_slice("éxito".as_bytes());
        assert_eq!(
            parsear_registro(&datos),
            Some(ResultadoRegistro {
                conexion: 3,
                exito: true,
                solo_lectura: true,
            })
        );
        assert_eq!(parsear_registro(&[0x02, 0x00]), None);
        assert_eq!(parsear_registro(&datos[..3]), None);
        for n in 0..datos.len() {
            assert_eq!(parsear_registro(&datos[..n]), None);
        }
        datos[6] = 1;
        assert!(!parsear_registro(&datos).expect("ACK completo").solo_lectura);
        datos.push(0);
        assert_eq!(parsear_registro(&datos), None, "sin bytes sobrantes");
    }

    #[test]
    fn los_registros_llevan_cabecera_y_blob() {
        let mut salida = Vec::new();
        escribir_shm(&mut salida, KIND_STATIC, 7, 123, &[9, 8, 7]).expect("volcar shm");
        assert_eq!(
            salida,
            vec![2, 7, 0, 0, 0, 123, 0, 0, 0, 0, 0, 0, 0, 9, 8, 7]
        );
        let mut salida = Vec::new();
        escribir_udp(&mut salida, 456, &[1, 2]).expect("volcar udp");
        assert_eq!(salida, vec![2, 0, 0, 0, 0xc8, 0x01, 0, 0, 0, 0, 0, 0, 1, 2]);
    }

    #[test]
    fn la_fecha_utc_se_formatea_en_iso_y_en_compacto() {
        let (iso, corta) = fecha_utc(UNIX_EPOCH);
        assert_eq!(iso, "1970-01-01T00:00:00Z");
        assert_eq!(corta, "19700101-000000");
        let (iso, corta) = fecha_utc(UNIX_EPOCH + Duration::from_secs(1_790_720_103));
        assert_eq!(iso, "2026-09-29T22:15:03Z");
        assert_eq!(corta, "20260929-221503");
    }

    #[test]
    fn el_sha256_es_el_esperado() {
        let base = carpeta_de_prueba("sha");
        let ruta = base.join("abc.txt");
        fs::write(&ruta, b"abc").expect("escribir fichero");
        assert_eq!(
            sha256_fichero(&ruta).expect("hash"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn el_nombre_de_fichero_se_sanea() {
        assert_eq!(sanear("Spa Francorchamps"), "Spa-Francorchamps");
        assert_eq!(sanear("practica"), "practica");
        assert_eq!(sanear("--raro--"), "raro");
        assert_eq!(sanear("///"), "desconocida");
        assert_eq!(sanear(""), "desconocida");
    }

    #[test]
    fn el_manifiesto_lleva_esquema_versiones_recuentos_y_hashes() {
        let resumen = Resumen {
            ac_version: "1.8.12".into(),
            sm_version: "1.8.12".into(),
            pista: "Spa".into(),
            tipo: "carrera".into(),
            fecha: "2026-09-29T22:15:03Z".into(),
            duracion_s: 61.5,
            contadores: Contadores {
                physics: 350,
                graphics: 60,
                estaticos: 2,
                udp: 21,
            },
            sha256_shm: "aa".into(),
            sha256_udp: "bb".into(),
        };
        let manifiesto = manifiesto(&resumen);
        assert_eq!(manifiesto["schema"], "vantare.acc-temporal-v1");
        assert_eq!(manifiesto["acVersion"], "1.8.12");
        assert_eq!(manifiesto["smVersion"], "1.8.12");
        assert_eq!(manifiesto["eventos"]["physics"], 350);
        assert_eq!(manifiesto["eventos"]["udp"], 21);
        assert_eq!(manifiesto["sha256"]["shm.bin"], "aa");
        assert_eq!(manifiesto["duracion_s"], 61.5);
    }

    #[test]
    fn la_configuracion_en_utf16_como_la_escribe_acc_se_lee() {
        let base = carpeta_de_prueba("config-utf16");
        let ruta = base.join("broadcasting.json");
        let texto = "{\n  \"updListenerPort\": 9000,\n  \"connectionPassword\": \"uno\",\n  \"commandPassword\": \"\"\n}";
        let bytes: Vec<u8> = texto.encode_utf16().flat_map(u16::to_le_bytes).collect();
        fs::write(&ruta, bytes).expect("escribir config");
        let config = config_broadcasting(&ruta)
            .expect("JSON válido")
            .expect("config");
        assert_eq!(
            (config.puerto, config.password_conexion.as_str()),
            (9000, "uno")
        );
    }

    #[test]
    fn la_configuracion_acepta_las_dos_grafias_del_puerto() {
        let base = carpeta_de_prueba("config");
        let ruta = base.join("broadcasting.json");
        fs::write(
            &ruta,
            r#"{"updListenerPort": 9000, "connectionPassword": "uno", "commandPassword": "dos"}"#,
        )
        .expect("escribir config");
        assert_eq!(
            config_broadcasting(&ruta).expect("JSON válido"),
            Some(ConfigBroadcasting {
                puerto: 9000,
                password_conexion: "uno".into(),
            })
        );
        fs::write(&ruta, r#"{"udpListenerPort": 9001}"#).expect("escribir config");
        let config = config_broadcasting(&ruta)
            .expect("JSON válido")
            .expect("está el fichero");
        assert_eq!(config.puerto, 9001);
        assert_eq!(config.password_conexion, "");
        assert!(
            config_broadcasting(&base.join("no-existe.json"))
                .expect("la ausencia no es error")
                .is_none()
        );
        // ACC lo escribe con BOM UTF-8 y lo deja vacío hasta configurarlo.
        let mut con_bom = vec![0xEF, 0xBB, 0xBF];
        con_bom.extend_from_slice(br#"{"updListenerPort": 9002, "connectionPassword": "clave"}"#);
        fs::write(&ruta, con_bom).expect("escribir config");
        let config = config_broadcasting(&ruta)
            .expect("JSON con BOM")
            .expect("está configurado");
        assert_eq!(config.puerto, 9002);
        assert_eq!(config.password_conexion, "clave");
        fs::write(&ruta, br#"{"udpListenerPort":0}"#).expect("puerto cero");
        assert!(config_broadcasting(&ruta).is_err());
        fs::write(&ruta, [0xff, 0xfe, b'{', 0, 1]).expect("UTF-16 truncado");
        assert!(config_broadcasting(&ruta).is_err());
        fs::write(&ruta, [0xff, 0xfe, 0, 0xd8]).expect("surrogate suelto");
        assert!(config_broadcasting(&ruta).is_err());
        fs::write(&ruta, b"").expect("escribir config");
        assert!(
            config_broadcasting(&ruta)
                .expect("vacío no es error")
                .is_none()
        );
        fs::write(&ruta, b"  \r\n\t").expect("escribir config");
        assert!(
            config_broadcasting(&ruta)
                .expect("espacios no es error")
                .is_none()
        );
        fs::write(&ruta, "{no es json").expect("escribir config");
        assert!(config_broadcasting(&ruta).is_err());
        fs::write(&ruta, r#"{"otraClave": 1}"#).expect("escribir config");
        assert!(config_broadcasting(&ruta).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    /// Lee una entrada ustar del archivo ya descomprimido y comprueba su
    /// checksum; devuelve (nombre, contenido, offset de la siguiente entrada).
    fn leer_entrada_tar(archivo: &[u8], inicio: usize) -> (String, Vec<u8>, usize) {
        let cabecera = &archivo[inicio..inicio + 512];
        assert_eq!(&cabecera[257..263], b"ustar\0");
        let mut con_espacios = cabecera.to_vec();
        con_espacios[148..156].fill(b' ');
        let suma: u64 = con_espacios.iter().map(|byte| u64::from(*byte)).sum();
        let escrita = std::str::from_utf8(&cabecera[148..154]).expect("checksum ascii");
        assert_eq!(
            suma,
            u64::from_str_radix(escrita, 8).expect("checksum octal")
        );
        let nombre = String::from_utf8(
            cabecera[..100]
                .iter()
                .take_while(|byte| **byte != 0)
                .copied()
                .collect(),
        )
        .expect("nombre ascii");
        let tamano = std::str::from_utf8(&cabecera[124..136])
            .expect("tamaño ascii")
            .trim_matches(['\0', ' ']);
        let tamano = usize::from_str_radix(tamano, 8).expect("tamaño octal");
        let contenido = archivo[inicio + 512..inicio + 512 + tamano].to_vec();
        (nombre, contenido, inicio + 512 + tamano.div_ceil(512) * 512)
    }

    #[test]
    fn el_paquete_tar_gz_contiene_los_tres_ficheros() {
        let base = carpeta_de_prueba("tar");
        let shm = base.join("shm.bin");
        let manifest = base.join("manifest.json");
        fs::write(&shm, b"SHM-DE-PRUEBA").expect("escribir shm");
        fs::write(&manifest, b"{}").expect("escribir manifiesto");
        let paquete = base.join("paquete.tar.gz");
        empaquetar(&paquete, &[("shm.bin", &shm), ("manifest.json", &manifest)])
            .expect("empaquetar");

        let mut archivo = Vec::new();
        flate2::read::GzDecoder::new(File::open(&paquete).expect("abrir paquete"))
            .read_to_end(&mut archivo)
            .expect("descomprimir");
        let (nombre, contenido, siguiente) = leer_entrada_tar(&archivo, 0);
        assert_eq!(nombre, "shm.bin");
        assert_eq!(contenido, b"SHM-DE-PRUEBA");
        let (nombre, contenido, siguiente) = leer_entrada_tar(&archivo, siguiente);
        assert_eq!(nombre, "manifest.json");
        assert_eq!(contenido, b"{}");
        assert_eq!(archivo.len() - siguiente, 1024, "dos bloques de cierre");
        assert!(
            archivo[siguiente..].iter().all(|byte| *byte == 0),
            "cierre a ceros"
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn las_versiones_se_leen_de_la_pagina_static() {
        let mut estatico = [0_u8; TAM_STATIC];
        // smVersion en 0 y acVersion en 30, UTF-16LE terminadas en NUL.
        for (indice, unidad) in "1.9.2".encode_utf16().enumerate() {
            estatico[indice * 2..indice * 2 + 2].copy_from_slice(&unidad.to_le_bytes());
        }
        for (indice, unidad) in "1.8.12".encode_utf16().enumerate() {
            let posicion = 30 + indice * 2;
            estatico[posicion..posicion + 2].copy_from_slice(&unidad.to_le_bytes());
        }
        assert_eq!(
            versiones_del_estatico(&estatico),
            ("1.8.12".into(), "1.9.2".into())
        );
        assert_eq!(
            versiones_del_estatico(&[0_u8; TAM_STATIC]),
            (String::new(), String::new())
        );
    }
}
