use super::{EmailIntent, EmailMode, EmailStage, EmailView};
use crate::protocol::HostError;
use std::time::{Duration, Instant};
use vantare_ipc::services_protocol::EmailAction;
// Bounds verified in services/account/email.rs::password, begin_email and verify.
pub const EMAIL_MAX: usize = 254;
pub const PASSWORD_MAX: usize = 1024;
pub const CODE_LENGTH: usize = 6;
pub const RETRY_AFTER_MAX_SECONDS: u16 = 600;
pub const PURCHASE_WAIT_SECONDS: u64 = 600;
pub(super) struct Form {
    pub mode: EmailMode,
    pub stage: EmailStage,
    pub restarted: bool,
    pub retry_at: Instant,
    pub message: String,
}
impl Form {
    pub fn new(mode: EmailMode, now: Instant) -> Self {
        Self {
            mode,
            stage: EmailStage::Form,
            restarted: false,
            retry_at: now,
            message: String::new(),
        }
    }
    pub fn view(&self, now: Instant) -> EmailView {
        let seconds = self
            .retry_at
            .saturating_duration_since(now)
            .as_secs()
            .saturating_add(u64::from(
                self.retry_at.saturating_duration_since(now).subsec_nanos() > 0,
            ));
        EmailView {
            mode: self.mode,
            stage: self.stage,
            restarted: self.restarted,
            retry_after_seconds: u16::try_from(seconds)
                .unwrap_or(RETRY_AFTER_MAX_SECONDS)
                .min(RETRY_AFTER_MAX_SECONDS),
            message: self.message.clone(),
        }
    }
    pub fn accept(
        &mut self,
        stage: EmailStage,
        seconds: u64,
        message: &str,
        failed: bool,
        now: Instant,
    ) {
        (self.stage, self.restarted) = next_stage(self.stage, stage, failed);
        self.retry_at = now + Duration::from_secs(seconds.min(u64::from(RETRY_AFTER_MAX_SECONDS)));
        self.message = if self.restarted
            && matches!(
                self.mode,
                EmailMode::SignInPassword | EmailMode::SignUpPassword
            ) {
            "El acceso se reinició. Vuelve a introducir tu contraseña para continuar.".into()
        } else {
            super::clean(message)
        };
    }
    pub fn command(&self, intent: &EmailIntent, now: Instant) -> Result<EmailAction, HostError> {
        let invalid = || HostError::AccountInvalid;
        Ok(match intent {
            EmailIntent::Begin {
                mode,
                email,
                password,
            } if self.stage == EmailStage::Form && self.mode == *mode && now >= self.retry_at => {
                let email = email.trim();
                if email.is_empty()
                    || email.len() > EMAIL_MAX
                    || !email.contains('@')
                    || email
                        .chars()
                        .any(|character| character.is_control() || character.is_ascii_whitespace())
                {
                    return Err(invalid());
                }
                let with_password =
                    matches!(mode, EmailMode::SignInPassword | EmailMode::SignUpPassword);
                if password.len() > PASSWORD_MAX
                    || password.contains('\0')
                    || (with_password && password.is_empty())
                    || (!with_password && !password.is_empty())
                {
                    return Err(invalid());
                }
                EmailAction::Begin {
                    mode: (*mode).into(),
                    email: email.into(),
                    password: password.clone(),
                }
            }
            EmailIntent::Verify { code }
                if self.stage == EmailStage::Code
                    && code.len() == CODE_LENGTH
                    && code.bytes().all(|b| b.is_ascii_digit()) =>
            {
                EmailAction::Verify { code: code.clone() }
            }
            EmailIntent::Reset {
                password,
                sign_out_others,
            } if self.stage == EmailStage::NewPassword
                && !password.is_empty()
                && password.len() <= PASSWORD_MAX
                && !password.contains('\0') =>
            {
                EmailAction::Reset {
                    password: password.clone(),
                    sign_out_of_other_sessions: *sign_out_others,
                }
            }
            EmailIntent::Resend {} if self.stage == EmailStage::Code && now >= self.retry_at => {
                EmailAction::Resend {}
            }
            EmailIntent::Finish {} if self.stage == EmailStage::Consent => EmailAction::Finish {},
            EmailIntent::Cancel {} => EmailAction::Cancel {},
            _ => return Err(invalid()),
        })
    }
}

// Copied from frozen hub/services/login.rs::next_stage at 5aa554f80.
fn next_stage(current: EmailStage, reply: EmailStage, failed: bool) -> (EmailStage, bool) {
    (
        reply,
        failed && reply == EmailStage::Form && current != EmailStage::Form,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn begin_checks_mode_stage_byte_bounds_and_password_without_sending() {
        let now = Instant::now();
        let form = Form::new(EmailMode::SignInPassword, now);
        let begin = |mode, email: String, password: String| EmailIntent::Begin {
            mode,
            email,
            password,
        };
        assert!(
            form.command(
                &begin(
                    EmailMode::SignInPassword,
                    "qa@example.invalid".into(),
                    "secret".into()
                ),
                now
            )
            .is_ok()
        );
        for intent in [
            begin(
                EmailMode::SignInCode,
                "qa@example.invalid".into(),
                String::new(),
            ),
            begin(EmailMode::SignInPassword, String::new(), "secret".into()),
            begin(
                EmailMode::SignInPassword,
                "missing-at".into(),
                "secret".into(),
            ),
            begin(
                EmailMode::SignInPassword,
                "qa@exa mple.invalid".into(),
                "secret".into(),
            ),
            begin(
                EmailMode::SignInPassword,
                "qa@exa\u{0085}mple.invalid".into(),
                "secret".into(),
            ),
            begin(
                EmailMode::SignInPassword,
                format!("{}@invalid", "x".repeat(EMAIL_MAX)),
                "secret".into(),
            ),
            begin(
                EmailMode::SignInPassword,
                "qa@example.invalid".into(),
                String::new(),
            ),
            begin(
                EmailMode::SignInPassword,
                "qa@example.invalid".into(),
                "x".repeat(PASSWORD_MAX + 1),
            ),
            begin(
                EmailMode::SignInPassword,
                "qa@example.invalid".into(),
                "x\0x".into(),
            ),
            EmailIntent::Verify {
                code: "123456".into(),
            },
            EmailIntent::Finish {},
            EmailIntent::Reset {
                password: "new".into(),
                sign_out_others: true,
            },
            EmailIntent::Resend {},
        ] {
            assert!(matches!(
                form.command(&intent, now),
                Err(HostError::AccountInvalid)
            ));
        }
        let code = Form::new(EmailMode::SignInCode, now);
        assert!(
            code.command(
                &begin(
                    EmailMode::SignInCode,
                    "qa@example.invalid".into(),
                    String::new()
                ),
                now
            )
            .is_ok()
        );
        assert!(matches!(
            code.command(
                &begin(
                    EmailMode::SignInCode,
                    "qa@example.invalid".into(),
                    "unexpected".into()
                ),
                now
            ),
            Err(HostError::AccountInvalid)
        ));
    }
    #[test]
    fn verify_reset_consent_and_resend_are_stage_specific_and_clock_injected() {
        let now = Instant::now();
        let mut form = Form::new(EmailMode::Recovery, now);
        form.accept(EmailStage::Code, 2, "Check your email", false, now);
        assert!(
            form.command(
                &EmailIntent::Verify {
                    code: "123456".into()
                },
                now
            )
            .is_ok()
        );
        for code in ["12345", "1234567", "１２３４５６", "abcdef", "12345\n"] {
            assert!(matches!(
                form.command(&EmailIntent::Verify { code: code.into() }, now),
                Err(HostError::AccountInvalid)
            ));
        }
        assert!(matches!(
            form.command(&EmailIntent::Resend {}, now),
            Err(HostError::AccountInvalid)
        ));
        assert_eq!(
            form.view(now + Duration::from_millis(1500))
                .retry_after_seconds,
            1
        );
        assert!(
            form.command(&EmailIntent::Resend {}, now + Duration::from_secs(2))
                .is_ok()
        );
        form.accept(EmailStage::NewPassword, 0, "", false, now);
        assert!(
            form.command(
                &EmailIntent::Reset {
                    password: "secret".into(),
                    sign_out_others: true
                },
                now
            )
            .is_ok()
        );
        assert!(matches!(
            form.command(
                &EmailIntent::Verify {
                    code: "123456".into()
                },
                now
            ),
            Err(HostError::AccountInvalid)
        ));
        form.accept(EmailStage::Consent, 0, "", false, now);
        assert!(form.command(&EmailIntent::Finish {}, now).is_ok());
        form.accept(EmailStage::Form, u64::MAX, "Restarted", true, now);
        assert!(form.view(now).restarted);
        assert_eq!(form.view(now).retry_after_seconds, RETRY_AFTER_MAX_SECONDS);
    }
    #[test]
    fn credentials_are_redacted_and_unknown_fields_rejected() {
        let value = EmailIntent::Begin {
            mode: EmailMode::SignInPassword,
            email: "qa@example.invalid".into(),
            password: "example".into(),
        };
        let debug = format!("{value:?}");
        for secret in ["qa@example.invalid", "example", "http"] {
            assert!(!debug.contains(secret));
        }
        assert!(
            serde_json::from_value::<EmailIntent>(
                serde_json::json!({"action":"verify","code":"123456","extra":true})
            )
            .is_err()
        );
        assert!(
            serde_json::from_value::<EmailIntent>(serde_json::json!({"action":"unknown"})).is_err()
        );
    }
}
