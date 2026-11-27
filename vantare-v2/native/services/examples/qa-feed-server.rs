//! Servidor de feed de pruebas para la matriz instalada (#2771, P5 PR C). Nunca va en un
//! paquete. Solo escucha en `127.0.0.1` con un puerto efímero y solo sirve, desde una
//! carpeta QA guardada, las dos rutas que traduce el `vantare.exe` QA: la lista de releases
//! y `download/<etiqueta>/<archivo>`. Anota cada ruta pedida y sale al ver el archivo de parada.
//!
//! `qa-feed-server <carpeta> <archivo-de-puerto> <registro> <archivo-de-parada>`
use std::{
    fs,
    io::{self, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

type Failure = Box<dyn std::error::Error>;

/// Carpeta bajo la raíz QA del servidor o, en CI, bajo el temporal del runner.
fn guarded(path: &Path) -> Result<PathBuf, Failure> {
    let prefix = if std::env::var("CI").as_deref() == Ok("true") {
        PathBuf::from(std::env::var_os("RUNNER_TEMP").ok_or("RUNNER_TEMP required")?)
    } else {
        PathBuf::from("D:/VantareServer/qa")
    };
    let folder = path.canonicalize()?;
    if folder == prefix.canonicalize()? || !folder.starts_with(prefix.canonicalize()?) {
        return Err("carpeta fuera de la raíz QA".into());
    }
    Ok(folder)
}

/// Ruta HTTP → archivo de la carpeta. Cualquier otra cosa es 404.
fn route(folder: &Path, path: &str) -> Option<PathBuf> {
    if path == "/api/releases?per_page=100" {
        return Some(folder.join("releases.json"));
    }
    let (tag, file) = path.strip_prefix("/download/")?.split_once('/')?;
    let plain = |part: &str| {
        !part.is_empty()
            && !part.starts_with('.')
            && part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_'))
    };
    (plain(tag) && plain(file)).then(|| folder.join(tag).join(file))
}

fn serve(mut stream: TcpStream, folder: &Path, log: &Path) -> io::Result<()> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    // Lee la petición entera antes de responder: en Windows, bytes sin leer al cerrar
    // pueden resetear la conexión.
    let mut request = Vec::new();
    while !request.ends_with(b"\r\n\r\n") {
        if request.len() >= 8192 {
            return Err(io::Error::other("cabeceras demasiado largas"));
        }
        let mut byte = [0];
        stream.read_exact(&mut byte)?;
        request.push(byte[0]);
    }
    let line = String::from_utf8_lossy(&request);
    let path = line.split(' ').nth(1).unwrap_or_default();
    writeln!(
        fs::OpenOptions::new().create(true).append(true).open(log)?,
        "{path}"
    )?;
    let (status, body) = match route(folder, path).and_then(|file| fs::read(file).ok()) {
        Some(body) => ("200 OK", body),
        None => ("404 Not Found", Vec::new()),
    };
    stream.write_all(
        format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .as_bytes(),
    )?;
    stream.write_all(&body)
}

fn main() -> Result<(), Failure> {
    let args: Vec<PathBuf> = std::env::args_os().skip(1).map(PathBuf::from).collect();
    let [folder, port, log, stop] = args.as_slice() else {
        return Err("uso: qa-feed-server <carpeta> <puerto> <registro> <parada>".into());
    };
    let folder = guarded(folder)?;
    for path in [port, log, stop] {
        guarded(path.parent().ok_or("ruta sin carpeta")?)?;
    }
    let listener = TcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    // El puerto aparece completo o no aparece: quien lo espera nunca lee medio número.
    let temporary = port.with_extension("tmp");
    fs::write(&temporary, listener.local_addr()?.port().to_string())?;
    fs::rename(&temporary, port)?;
    // Vigilancia acotada: sale aunque nadie lo pare.
    let until = Instant::now() + Duration::from_mins(10);
    while !stop.exists() && Instant::now() < until {
        match listener.accept() {
            Ok((stream, _)) => {
                if let Err(error) = serve(stream, &folder, log) {
                    eprintln!("qa-feed-server: {error}");
                }
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}
