use std::fmt;

pub type Result<T> = std::result::Result<T, Error>;

/// No conserva cuerpo remoto, URL, rutas ni errores que puedan contener tokens.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    Unconfigured,
    BridgeUnconfigured,
    Authentication,
    Denied,
    DeviceLimit,
    Offline,
    InvalidCredential,
    Expired,
    Clock,
    Storage,
    Protocol,
    Unsupported,
    Busy,
    Canceled,
    Uncertain,
    TooLarge,
    Conflict,
    Version,
    NotFound,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Unconfigured => "servicio no configurado",
            Self::BridgeUnconfigured => "servicio no configurado: falta el puente de identidad",
            Self::Authentication => "se requiere iniciar sesión",
            Self::Denied => "operación no autorizada",
            Self::DeviceLimit => "límite de dispositivos",
            Self::Offline => "servicio sin conexión",
            Self::InvalidCredential => "credencial firmada inválida",
            Self::Expired => "credencial vencida",
            Self::Clock => "revalidación del reloj necesaria",
            Self::Storage => "almacenamiento protegido no disponible",
            Self::Protocol => "respuesta o protocolo inválido",
            Self::Unsupported => "plataforma no compatible",
            Self::Busy => "operación en curso",
            Self::Canceled => "operación cancelada",
            Self::Uncertain => "resultado sin confirmar",
            Self::TooLarge => "datos por encima del límite",
            Self::Conflict => "conflicto de revisión",
            Self::Version => "actualización requerida",
            Self::NotFound => "sin datos guardados",
        })
    }
}

impl std::error::Error for Error {}
