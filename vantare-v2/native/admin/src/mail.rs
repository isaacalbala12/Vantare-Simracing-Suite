//! Marketing drafts and recipient counts. Consent and dispatch decisions belong to SQL.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use vantare_services::{Error, Result};
pub const LOCALES: [&str; 4] = ["es", "en", "it", "pt-BR"];
pub const GROUPS: [(&str, &str); 7] = [
    ("free", "Gratis"),
    ("pro", "Pro"),
    ("pro_plus", "Pro Plus"),
    ("launch", "Launch Edition"),
    ("testers", "Testers"),
    ("creators", "Creadores"),
    ("waitlist", "Lista de espera"),
];
pub const TEMPLATES: [(&str, &str); 3] = [
    ("news", "Novedades"),
    ("offer", "Oferta"),
    ("launch", "Lanzamiento"),
];
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Copy {
    pub subject: String,
    pub body: String,
}
pub type Content = BTreeMap<String, Copy>;
pub fn valid_content(content: &Content) -> bool {
    content.len() == 4
        && LOCALES.iter().all(|l| {
            content.get(*l).is_some_and(|c| {
                c.subject.chars().count() <= 200
                    && !c.subject.contains(['\r', '\n'])
                    && c.body.chars().count() <= 12000
            })
        })
}
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct Campaign {
    pub id: String,
    pub revision: u32,
    pub name: String,
    pub template: String,
    pub target_group: String,
    pub state: String,
    #[serde(default)]
    pub content: Content,
}
impl Campaign {
    pub fn validate(&self, detail: bool) -> Result<()> {
        if !vantare_services::license::uuid(&self.id)
            || self.revision == 0
            || self.name.chars().count() > 120
            || !TEMPLATES.iter().any(|(k, _)| *k == self.template)
            || !GROUPS.iter().any(|(k, _)| *k == self.target_group)
            || !["draft", "sending", "completed"].contains(&self.state.as_str())
            || (detail && !valid_content(&self.content))
        {
            return Err(Error::Protocol);
        }
        Ok(())
    }
}
#[derive(Default)]
pub struct MailState {
    pub cleanup_pending: u32,
    pub campaigns: Vec<Campaign>,
    pub campaign: Option<Campaign>,
    pub counts: BTreeMap<String, u32>,
    pub quota: u32,
    pub history: Vec<serde_json::Value>,
    pub totals: BTreeMap<String, u32>,
    pub generated: Option<Content>,
    pub sync_cursor: Option<String>,
}
impl MailState {
    pub fn demo() -> Self {
        let texts = [
            (
                "es",
                "Tu próxima carrera empieza aquí",
                "Hola, piloto.\n\nDescubre las novedades de Vantare y prepara tu próxima sesión.\n\nNos vemos en pista,\nIsaac · Vantare",
            ),
            (
                "en",
                "Your next race starts here",
                "Hello, driver.\n\nDiscover what's new in Vantare and prepare your next session.",
            ),
            (
                "it",
                "La tua prossima gara inizia qui",
                "Ciao pilota.\n\nScopri le novità di Vantare e prepara la tua prossima sessione.",
            ),
            (
                "pt-BR",
                "Sua próxima corrida começa aqui",
                "Olá, piloto.\n\nConheça as novidades da Vantare e prepare sua próxima sessão.",
            ),
        ];
        let content = texts
            .into_iter()
            .map(|(locale, subject, body)| {
                (
                    locale.to_owned(),
                    Copy {
                        subject: subject.to_owned(),
                        body: body.to_owned(),
                    },
                )
            })
            .collect();
        Self {
            campaigns: vec![Campaign {
                id: "00000000-0000-4000-8000-000000001636".into(),
                revision: 1,
                name: "Novedades de octubre".into(),
                template: "news".into(),
                target_group: "testers".into(),
                state: "draft".into(),
                content,
            }],
            counts: GROUPS
                .iter()
                .zip([142, 38, 21, 12, 18, 4, 96])
                .map(|((k, _), n)| ((*k).into(), n))
                .collect(),
            quota: 300,
            ..Self::default()
        }
    }
}

impl crate::client::Action {
    pub(crate) fn mail_valid(&self) -> Option<bool> {
        Some(match self {
            Self::MailList | Self::MailNew | Self::MailCleanup => true,
            Self::MailForgetWaitlist { email, confirm } => {
                *confirm && email.len() <= 320 && email == email.trim() && email.contains('@')
            }
            Self::MailGet { campaign_id } => vantare_services::license::uuid(campaign_id),
            Self::MailSave {
                campaign_id,
                revision,
                name,
                template,
                target_group,
                content,
            } => {
                vantare_services::license::uuid(campaign_id)
                    && *revision > 0
                    && !name.trim().is_empty()
                    && name.chars().count() <= 120
                    && crate::mail::TEMPLATES.iter().any(|(k, _)| *k == template)
                    && crate::mail::GROUPS.iter().any(|(k, _)| *k == target_group)
                    && crate::mail::valid_content(content)
            }
            Self::MailApprove {
                campaign_id,
                revision,
                confirm,
            } => vantare_services::license::uuid(campaign_id) && *revision > 0 && *confirm,
            Self::MailSendBatch {
                campaign_id,
                revision,
            } => vantare_services::license::uuid(campaign_id) && *revision > 0,
            Self::MailDraft {
                campaign_id,
                revision,
                brief,
                template,
            } => {
                vantare_services::license::uuid(campaign_id)
                    && *revision > 0
                    && !brief.trim().is_empty()
                    && brief.chars().count() <= 4000
                    && crate::mail::TEMPLATES.iter().any(|(k, _)| *k == template)
            }
            Self::MailSync { cursor } => cursor.as_ref().is_none_or(|s| s.len() <= 320),
            _ => return None,
        })
    }
}

use crate::client::{Action, field};
impl crate::state::State {
    pub(crate) fn accept_mail(
        &mut self,
        action: &Action,
        response: &serde_json::Value,
    ) -> Result<()> {
        match action {
            Action::MailForgetWaitlist { .. } => {}
            Action::MailList | Action::MailCleanup => {
                let campaigns: Vec<crate::mail::Campaign> = field(response, "campaigns")?;
                if campaigns.len() > 100 {
                    return Err(Error::TooLarge);
                }
                for c in &campaigns {
                    c.validate(false)?;
                }
                let counts = field(response, "counts")?;
                let quota: u32 = field(response, "quota_remaining")?;
                if quota > 300 {
                    return Err(Error::Protocol);
                }
                self.mail.cleanup_pending = response
                    .get("cleanup")
                    .and_then(|c| c.get("pending"))
                    .map(|v| serde_json::from_value(v.clone()))
                    .transpose()
                    .map_err(|_| Error::Protocol)?
                    .unwrap_or_default();
                self.mail.campaigns = campaigns;
                self.mail.counts = counts;
                self.mail.quota = quota;
                self.mail.campaign = None;
            }
            Action::MailGet { campaign_id }
            | Action::MailSave { campaign_id, .. }
            | Action::MailApprove { campaign_id, .. }
            | Action::MailSendBatch { campaign_id, .. } => {
                let c: crate::mail::Campaign = field(response, "campaign")?;
                c.validate(true)?;
                if &c.id != campaign_id {
                    return Err(Error::Protocol);
                }
                let history: Vec<serde_json::Value> = response
                    .get("history")
                    .map(|v| serde_json::from_value(v.clone()))
                    .transpose()
                    .map_err(|_| Error::Protocol)?
                    .unwrap_or_default();
                let totals = response
                    .get("totals")
                    .map(|v| serde_json::from_value(v.clone()))
                    .transpose()
                    .map_err(|_| Error::Protocol)?
                    .unwrap_or_default();
                let quota: u32 = response
                    .get("quota_remaining")
                    .map(|v| serde_json::from_value(v.clone()))
                    .transpose()
                    .map_err(|_| Error::Protocol)?
                    .unwrap_or(self.mail.quota);
                if quota > 300 || history.len() > 100 {
                    return Err(Error::Protocol);
                }
                self.mail.campaign = Some(c);
                self.mail.history = history;
                self.mail.totals = totals;
                self.mail.quota = quota;
            }
            Action::MailNew => {
                let c: crate::mail::Campaign = field(response, "campaign")?;
                c.validate(true)?;
                self.mail.campaign = Some(c);
                self.mail.history.clear();
                self.mail.totals.clear();
            }
            Action::MailDraft { .. } => {
                let content = field(response, "content")?;
                if !crate::mail::valid_content(&content) {
                    return Err(Error::Protocol);
                }
                self.mail.generated = Some(content);
            }
            Action::MailSync { .. } => {
                self.mail.sync_cursor = field(response, "next_cursor")?;
            }
            _ => return Err(Error::Protocol),
        }
        Ok(())
    }
    pub(crate) fn demo_mail_action(&mut self, action: &Action) {
        match action {
            Action::MailApprove { .. } => {
                if let Some(c) = &mut self.mail.campaign {
                    c.state = "sending".into();
                }
            }
            Action::MailSendBatch { .. } => {
                self.mail.totals.insert("accepted".into(), 3);
            }
            Action::MailSave {
                name,
                template,
                target_group,
                content,
                ..
            } => {
                if let Some(c) = &mut self.mail.campaign {
                    c.name.clone_from(name);
                    c.template.clone_from(template);
                    c.target_group.clone_from(target_group);
                    c.content.clone_from(content);
                    c.revision += 1;
                }
            }
            Action::MailNew => {
                let mut c = crate::mail::MailState::demo().campaigns.remove(0);
                c.name = "Nueva campaña".into();
                self.mail.campaign = Some(c);
            }
            Action::MailDraft { .. } => {
                self.mail.generated =
                    Some(crate::mail::MailState::demo().campaigns.remove(0).content);
            }
            _ => {}
        }
    }
}

/// Local starter copy. Placeholders must be replaced before SQL accepts approval.
pub fn template_content(template: usize) -> Content {
    let subjects = match template {
        1 => [
            "Una oferta de Vantare",
            "A Vantare offer",
            "Un'offerta Vantare",
            "Uma oferta da Vantare",
        ],
        2 => [
            "Lanzamiento de Vantare",
            "Vantare launch",
            "Lancio di Vantare",
            "Lançamento da Vantare",
        ],
        _ => [
            "Novedades de Vantare",
            "Vantare news",
            "Novità di Vantare",
            "Novidades da Vantare",
        ],
    };
    let intros = [
        "Hola, piloto.",
        "Hello, driver.",
        "Ciao pilota.",
        "Olá, piloto.",
    ];
    LOCALES
        .iter()
        .enumerate()
        .map(|(i, l)| {
            (
                (*l).into(),
                Copy {
                    subject: subjects[i].into(),
                    body: format!("{}\n\n{{{{contenido}}}}\n\nIsaac · Vantare", intros[i]),
                },
            )
        })
        .collect()
}
pub fn unsubscribe_label(locale: &str) -> &str {
    match locale {
        "es" => "Darme de baja de todos los correos",
        "it" => "Annulla tutte le email",
        "pt-BR" => "Cancelar todos os e-mails",
        _ => "Unsubscribe from all emails",
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn four_locales_and_safe_subjects_required() {
        let mut c = MailState::demo().campaigns.remove(0);
        assert!(c.validate(true).is_ok());
        c.content.remove("pt-BR");
        assert!(c.validate(true).is_err());
        c = MailState::demo().campaigns.remove(0);
        c.content.get_mut("es").unwrap().subject = "Header\r\nInjection".into();
        assert!(c.validate(true).is_err());
    }
}

#[cfg(test)]
mod workflow_tests {
    use super::*;
    use crate::state::{Screen, State};
    #[test]
    fn sending_requires_confirmation_and_private_mail_is_cleared_on_auth_loss() {
        let mut state = State::new(true, Screen::Mail);
        let action = Action::MailApprove {
            campaign_id: state.mail.campaigns[0].id.clone(),
            revision: 1,
            confirm: true,
        };
        assert!(state.confirm().is_err());
        state.propose(action.clone()).expect("valid confirmation");
        assert_eq!(state.mail.campaigns[0].state, "draft");
        assert_eq!(state.confirm().expect("Owner confirms"), action);
        state.failed(Error::Denied);
        assert!(state.mail.campaigns.is_empty());
        assert!(state.mail.campaign.is_none());
        assert!(!state.signed_in);
    }
    #[test]
    fn malformed_mail_reply_cannot_replace_a_reviewed_campaign() {
        let mut state = State::new(true, Screen::Mail);
        let c = state.mail.campaigns[0].clone();
        state.mail.campaign = Some(c.clone());
        assert!(state.accept(&Action::MailGet{campaign_id:c.id.clone()},&serde_json::json!({"campaign":{"id":c.id,"revision":1,"name":"bad","template":"news","target_group":"testers","state":"draft","content":{}}})).is_err());
        assert_eq!(state.mail.campaign, Some(c));
    }
}
