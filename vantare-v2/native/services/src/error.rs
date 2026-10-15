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
    CheckoutRecovery,
    Protocol,
    Unsupported,
    Busy,
    Canceled,
    Uncertain,
    EvidencePending,
    TooLarge,
    Conflict,
    PilotRejected,
    Version,
    NotFound,
    ConfirmationMismatch,
    AccountConflict,
    AccountChangeIncomplete,
    DeletionUnavailable,
    RateLimited,
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
            Self::CheckoutRecovery => "Intento de compra ilegible. Se conserva para recuperación asistida: contacta con soporte para comprobar la compra antes de crear otro intento.",
            Self::Protocol => "respuesta o protocolo inválido",
            Self::Unsupported => "plataforma no compatible",
            Self::Busy => "operación en curso",
            Self::Canceled => "operación cancelada",
            Self::Uncertain => "resultado sin confirmar",
            Self::EvidencePending => "capturas en validación: el borrador y el intento se conservan; reintenta el envío cuando el servidor termine",
            Self::TooLarge => "datos por encima del límite",
            Self::Conflict => "conflicto de revisión",
            Self::PilotRejected => "perfil pendiente de corrección: revisa los datos y vuelve a guardar",
            Self::Version => "actualización requerida",
            Self::NotFound => "sin datos guardados",
            Self::ConfirmationMismatch=>"el correo de confirmación no coincide con el correo actual",
            Self::AccountConflict=>"esta cuenta está protegida o ha cambiado de estado",
            Self::AccountChangeIncomplete=>"el cambio quedó incompleto; consulta la cuenta antes de volver a confirmarlo",
            Self::DeletionUnavailable=>"el borrado todavía no está disponible",
            Self::RateLimited=>"espera un minuto antes de volver a intentarlo",
        })
    }
}

impl std::error::Error for Error {}
