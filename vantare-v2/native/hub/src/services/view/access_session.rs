//! Confirmed identity and the observation phase have one owner.
use super::super::protocol::Session;

pub(super) enum SessionState {
    Confirmed(Session),
    Pending {
        identity: Session,
        waiting: bool,
        preserve_access: bool,
    },
}
#[cfg(test)]
impl From<Session> for SessionState {
    fn from(session: Session) -> Self {
        let mut state = Self::Confirmed(Session::SignedOut);
        state.observe(session, false);
        state
    }
}
impl SessionState {
    pub(super) fn identity(&self) -> Session {
        match self {
            Self::Confirmed(identity) | Self::Pending { identity, .. } => *identity,
        }
    }
    pub(super) fn current(&self) -> Session {
        match self {
            Self::Pending {
                preserve_access: false,
                ..
            } => Session::Pending,
            _ => self.identity(),
        }
    }
    pub(super) fn pending(&self) -> bool {
        matches!(self, Self::Pending { waiting: true, .. })
    }
    pub(super) fn finish_reply(&mut self) {
        if let Self::Pending { waiting, .. } = self {
            *waiting = false;
        }
    }
    pub(super) fn observe(&mut self, session: Session, preserve_access: bool) {
        *self = if session == Session::Pending {
            Self::Pending {
                identity: self.identity(),
                waiting: true,
                preserve_access,
            }
        } else {
            Self::Confirmed(session)
        };
    }
}
