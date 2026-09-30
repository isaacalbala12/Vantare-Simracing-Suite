//! Catálogo mínimo (textos compartidos con Go) y una sola cola de texto/voz.
use std::collections::VecDeque;
use std::time::Duration;

use crate::Applied;
use vantare_domain::{CarId, FlagKind, FlagScope, Quality, SessionId, Snapshot, SourceState};
use vantare_runtime::flows::FactKind;

pub const MAX_PENDING: usize = 8;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Locale {
    #[default]
    Es,
    En,
    It,
    PtBr,
}
impl Locale {
    /// Defaults de audio/config.go; nunca probar otra voz ante ausencia.
    pub fn voice(self) -> &'static str {
        match self {
            Self::Es => "ef_dora",
            Self::En => "af_bella",
            Self::It => "if_sara",
            Self::PtBr => "pf_dora",
        }
    }
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "es" => Some(Self::Es),
            "en" => Some(Self::En),
            "it" => Some(Self::It),
            "pt-BR" => Some(Self::PtBr),
            _ => None,
        }
    }
    pub fn code(self) -> &'static str {
        match self {
            Self::Es => "es",
            Self::En => "en",
            Self::It => "it",
            Self::PtBr => "pt-BR",
        }
    }
    fn index(self) -> usize {
        match self {
            Self::Es => 0,
            Self::En => 1,
            Self::It => 2,
            Self::PtBr => 3,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Intent {
    PitEntry,
    PitExit,
    LapCompleted,
    FuelOne,
    FuelTwo,
    FuelHalf,
    Yellow,
    Blue,
    CarLeft,
    CarRight,
    ThreeWide,
}
impl Intent {
    pub const ALL: [Self; 11] = [
        Self::PitEntry,
        Self::PitExit,
        Self::LapCompleted,
        Self::FuelOne,
        Self::FuelTwo,
        Self::FuelHalf,
        Self::Yellow,
        Self::Blue,
        Self::CarLeft,
        Self::CarRight,
        Self::ThreeWide,
    ];
    pub fn key(self) -> &'static str {
        match self {
            Self::PitEntry => "pitstops.entry",
            Self::PitExit => "pitstops.exit",
            Self::LapCompleted => "laps.completed",
            Self::FuelOne => "fuel.low_1l",
            Self::FuelTwo => "fuel.low_2l",
            Self::FuelHalf => "fuel.low_half_tank",
            Self::Yellow => "flags.yellow",
            Self::Blue => "flags.blue",
            Self::CarLeft => "spotter.car_left",
            Self::CarRight => "spotter.car_right",
            Self::ThreeWide => "spotter.three_wide",
        }
    }
    pub fn priority(self) -> u8 {
        match self {
            Self::CarLeft | Self::CarRight | Self::ThreeWide => 3,
            Self::Yellow | Self::Blue => 2,
            Self::FuelOne | Self::FuelTwo | Self::FuelHalf => 1,
            Self::PitEntry | Self::PitExit | Self::LapCompleted => 0,
        }
    }
    pub fn ttl(self) -> Duration {
        Duration::from_secs(match self {
            Self::CarLeft | Self::CarRight | Self::ThreeWide => 3,
            Self::FuelOne => 20,
            Self::FuelTwo => 25,
            Self::FuelHalf => 30,
            _ => 10,
        })
    }
    pub fn text(self, locale: Locale) -> &'static str {
        let texts = match self {
            Self::LapCompleted => [
                "Vuelta completada",
                "Lap completed",
                "Giro completato",
                "Volta concluída",
            ],
            Self::PitEntry => [
                "Entrando en boxes",
                "Entering the pits",
                "Ingresso ai box",
                "Entrando nos boxes",
            ],
            Self::PitExit => [
                "Saliendo de boxes",
                "Leaving the pits",
                "Uscita dai box",
                "Saindo dos boxes",
            ],
            Self::FuelOne => [
                "Queda un litro",
                "One litre remaining",
                "Rimane un litro",
                "Resta um litro",
            ],
            Self::FuelTwo => [
                "Quedan dos litros",
                "Two litres remaining",
                "Rimangono due litri",
                "Restam dois litros",
            ],
            Self::FuelHalf => [
                "Queda medio depósito",
                "Half a tank remaining",
                "Rimane metà serbatoio",
                "Resta meio tanque",
            ],
            Self::Yellow => [
                "Bandera amarilla",
                "Yellow flag",
                "Bandiera gialla",
                "Bandeira amarela",
            ],
            Self::Blue => ["Bandera azul", "Blue flag", "Bandiera blu", "Bandeira azul"],
            Self::CarLeft => [
                "Coche a la izquierda",
                "Car left",
                "Auto a sinistra",
                "Carro à esquerda",
            ],
            Self::CarRight => [
                "Coche a la derecha",
                "Car right",
                "Auto a destra",
                "Carro à direita",
            ],
            Self::ThreeWide => [
                "Tres coches en paralelo",
                "Three wide",
                "Tre auto affiancate",
                "Três carros lado a lado",
            ],
        };
        texts[locale.index()]
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Message {
    pub intent: Intent,
    pub locale: Locale,
    pub epoch: u64,
    pub sequence: u64,
    pub session: SessionId,
    pub car: CarId,
    pub created_at: Duration,
    pub expires_at: Duration,
}
impl Message {
    pub fn new(intent: Intent, locale: Locale, snapshot: &Snapshot, now: Duration) -> Option<Self> {
        Some(Self {
            intent,
            locale,
            epoch: snapshot.epoch,
            sequence: snapshot.sequence,
            session: snapshot.state.session.id,
            car: snapshot.state.player.as_ref()?.car,
            created_at: now,
            expires_at: now.saturating_add(intent.ttl()),
        })
    }
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({ "version": "vantare.radio.v1", "id": format!("{}.{}.{}", self.epoch, self.sequence, self.intent.key()),
            "intent": self.intent.key(), "priority": self.intent.priority(), "locale": self.locale.code(),
            "text": self.intent.text(self.locale), "epoch": self.epoch, "sequence": self.sequence,
            "session": self.session.0, "car": self.car.0,
            "created_at_ms": millis(self.created_at), "expires_at_ms": millis(self.expires_at) })
    }
    pub fn is_current(&self, snapshot: &Snapshot) -> bool {
        valid_now(self, snapshot)
    }
    fn context(&self) -> (u64, SessionId, CarId) {
        (self.epoch, self.session, self.car)
    }
}

#[derive(Default)]
pub struct Queue {
    pending: VecDeque<Message>,
    active: Option<Message>,
}
impl Queue {
    pub fn pending_len(&self) -> usize {
        self.pending.len()
    }
    pub fn clear(&mut self) {
        self.pending.clear();
        self.active = None;
    }
    pub fn finish(&mut self) {
        self.active = None;
    }
    pub fn submit(&mut self, message: Message) -> bool {
        if let Some(pending) = self.pending.iter_mut().find(|pending| {
            pending.intent == message.intent && pending.context() == message.context()
        }) {
            if message.sequence > pending.sequence {
                *pending = message;
            }
            return true;
        }
        if self.pending.len() == MAX_PENDING {
            let Some(index) = self
                .pending
                .iter()
                .position(|pending| pending.intent.priority() < message.intent.priority())
            else {
                return false;
            };
            self.pending.remove(index);
        }
        self.pending.push_back(message);
        true
    }
    /// Caducar no autoriza un "clear" de Spotter ni ningún otro hecho.
    pub fn select(&mut self, now: Duration) -> Option<(Message, bool)> {
        self.pending.retain(|message| message.expires_at > now);
        if self
            .active
            .as_ref()
            .is_some_and(|message| message.expires_at <= now)
        {
            self.finish();
        }
        let (index, pending) = self
            .pending
            .iter()
            .enumerate()
            .max_by_key(|(index, message)| {
                (message.intent.priority(), std::cmp::Reverse(*index))
            })?;
        let preempted = if let Some(active) = &self.active {
            if pending.intent.priority() != 3 || active.intent.priority() == 3 {
                return None;
            }
            true
        } else {
            false
        };
        let message = self.pending.remove(index)?;
        self.active = Some(message.clone());
        Some((message, preempted))
    }
    /// Si desaparece evidencia, parar audio activo y retirar avisos pendientes.
    pub fn refresh(&mut self, snapshot: &Snapshot) -> bool {
        self.pending.retain(|message| valid_now(message, snapshot));
        let stop = self
            .active
            .as_ref()
            .is_some_and(|message| !valid_now(message, snapshot));
        if stop {
            self.finish();
        }
        stop
    }
}

#[derive(Default)]
pub struct Families {
    context: Option<(u64, SessionId, CarId)>,
    fuel_started: Option<Intent>,
    flags_started: u8,
    spotter_started: Option<Intent>,
}
impl Families {
    pub fn reset(&mut self) {
        *self = Self::default();
    }
    pub fn started(&mut self, message: &Message) {
        match message.intent {
            Intent::FuelOne | Intent::FuelTwo | Intent::FuelHalf => {
                self.fuel_started = Some(message.intent);
            }
            Intent::Yellow => self.flags_started |= 1,
            Intent::Blue => self.flags_started |= 2,
            Intent::CarLeft | Intent::CarRight | Intent::ThreeWide => {
                self.spotter_started = Some(message.intent);
            }
            _ => {}
        }
    }
    pub fn evaluate(
        &mut self,
        snapshot: &Snapshot,
        applied: &Applied,
        locale: Locale,
        now: Duration,
    ) -> (Vec<Message>, bool) {
        let context = snapshot
            .state
            .player
            .as_ref()
            .filter(|_| snapshot.state.source_state == SourceState::Live)
            .map(|player| (snapshot.epoch, snapshot.state.session.id, player.car));
        let clear = applied.baseline || self.context != context;
        if clear {
            self.reset();
            self.context = context;
        }
        let mut intents = Vec::new();
        if context.is_none() {
            return (Vec::new(), clear);
        }
        if let Some(fact) = applied.fact
            && fact.cursor.epoch == snapshot.epoch
            && fact.sequence == snapshot.sequence
            && fact.session == snapshot.state.session.id
            && let FactKind::LapCompleted { car, completed } = fact.kind
            && Some(car) == snapshot.state.player.as_ref().map(|player| player.car)
            && snapshot
                .state
                .player_car()
                .is_some_and(|car| car.laps == Quality::Reliable(completed))
        {
            intents.push(Intent::LapCompleted);
        }
        if let Some(event) = applied.event
            && event.cursor.epoch == snapshot.epoch
            && event.sequence == snapshot.sequence
            && Some((event.cursor.epoch, event.session, event.car)) == context
            && snapshot
                .state
                .player_car()
                .is_some_and(|car| car.in_pits == Quality::Reliable(event.in_pits))
        {
            intents.push(if event.in_pits {
                Intent::PitEntry
            } else {
                Intent::PitExit
            });
        }
        let fuel = fuel_intent(snapshot);
        if self.fuel_started != fuel {
            self.fuel_started = None;
            if let Some(intent) = fuel {
                intents.push(intent);
            }
        }
        let flags = active_flags(snapshot);
        self.flags_started &= flags;
        for (bit, intent) in [(1, Intent::Yellow), (2, Intent::Blue)] {
            if flags & bit != 0 && self.flags_started & bit == 0 {
                intents.push(intent);
            }
        }
        let spotter = crate::spotter::evaluate(snapshot, self.spotter_started);
        if self.spotter_started != spotter {
            self.spotter_started = None;
            if let Some(intent) = spotter {
                intents.push(intent);
            }
        }
        (
            intents
                .into_iter()
                .filter_map(|intent| Message::new(intent, locale, snapshot, now))
                .collect(),
            clear,
        )
    }
}

fn millis(value: Duration) -> u64 {
    value
        .as_secs()
        .saturating_mul(1000)
        .saturating_add(u64::from(value.subsec_millis()))
}

fn fuel_intent(snapshot: &Snapshot) -> Option<Intent> {
    let player = snapshot.state.player.as_ref()?;
    let Quality::Reliable(litres) = player.fuel.level_l else {
        return None;
    };
    if !litres.is_finite() || litres <= 0.0 {
        return None;
    }
    if litres <= 1.0 {
        return Some(Intent::FuelOne);
    }
    if litres <= 2.0 {
        return Some(Intent::FuelTwo);
    }
    if let Quality::Reliable(capacity) = player.fuel.capacity_l
        && capacity.is_finite()
        && capacity > 0.0
        && litres <= capacity / 2.0
    {
        return Some(Intent::FuelHalf);
    }
    None
}

fn active_flags(snapshot: &Snapshot) -> u8 {
    let Quality::Reliable(flags) = &snapshot.state.flags else {
        return 0;
    };
    let mut result = 0;
    for flag in flags {
        if !matches!(flag.scope, FlagScope::Session)
            && !matches!(flag.scope, FlagScope::Car(car) if Some(car) == snapshot.state.player.as_ref().map(|player| player.car))
        {
            continue;
        }
        result |= match flag.kind {
            FlagKind::Yellow => 1,
            FlagKind::Blue => 2,
            _ => 0,
        };
    }
    result
}

fn valid_now(message: &Message, snapshot: &Snapshot) -> bool {
    if snapshot.state.source_state != SourceState::Live {
        return false;
    }
    if snapshot
        .state
        .player
        .as_ref()
        .map(|player| (snapshot.epoch, snapshot.state.session.id, player.car))
        != Some(message.context())
    {
        return false;
    }
    match message.intent {
        Intent::LapCompleted => message.sequence == snapshot.sequence,
        Intent::FuelOne | Intent::FuelTwo | Intent::FuelHalf => {
            fuel_intent(snapshot) == Some(message.intent)
        }
        Intent::Yellow => active_flags(snapshot) & 1 != 0,
        Intent::Blue => active_flags(snapshot) & 2 != 0,
        Intent::PitEntry | Intent::PitExit => {
            message.sequence <= snapshot.sequence
                && snapshot.state.player_car().is_some_and(|car| {
                    car.in_pits == Quality::Reliable(message.intent == Intent::PitEntry)
                })
        }
        Intent::CarLeft | Intent::CarRight | Intent::ThreeWide => {
            crate::spotter::evaluate(snapshot, Some(message.intent)) == Some(message.intent)
        }
    }
}
