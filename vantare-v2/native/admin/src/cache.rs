//! Short-lived confirmed reads, scoped to the current login. Writes always go online.
use crate::client::Action;
use serde_json::Value;
use std::time::{Duration, Instant};

#[derive(Default)]
pub(crate) struct ReadCache(Vec<(Action, Value, Instant)>);
impl ReadCache {
    pub fn get(&self, action: &Action, now: Instant) -> Option<Value> {
        self.0
            .iter()
            .find(|(key, _, at)| key == action && now.duration_since(*at) < Duration::from_secs(30))
            .map(|(_, value, _)| value.clone())
    }
    pub fn put(&mut self, action: Action, value: Value, now: Instant) {
        if !matches!(
            action,
            Action::SearchAccounts { .. }
                | Action::GetAccount { .. }
                | Action::GetRollout
                | Action::ListReports { .. }
        ) {
            return;
        }
        self.0.retain(|(key, _, _)| key != &action);
        if self.0.len() == 64 {
            self.0.remove(0);
        }
        self.0.push((action, value, now));
    }
    pub fn clear(&mut self) {
        self.0.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn full_page_and_its_details_remain_available_together() {
        let now = Instant::now();
        let mut cache = ReadCache::default();
        let page = Action::SearchAccounts {
            query: String::new(),
            limit: 50,
            cursor: None,
        };
        cache.put(page.clone(), serde_json::json!({"accounts":[]}), now);
        for index in 0..50 {
            cache.put(
                Action::GetAccount {
                    account_id: index.to_string(),
                },
                serde_json::json!({"account":index}),
                now,
            );
        }
        assert!(cache.get(&page, now).is_some());
    }
    #[test]
    fn confirmed_reads_expire_and_mutations_are_never_replayed() {
        let now = Instant::now();
        let mut cache = ReadCache::default();
        let action = Action::GetAccount {
            account_id: "account-a".into(),
        };
        cache.put(action.clone(), serde_json::json!({"account":"old"}), now);
        assert!(cache.get(&action, now + Duration::from_secs(29)).is_some());
        assert!(cache.get(&action, now + Duration::from_secs(30)).is_none());
        assert!(
            cache
                .get(
                    &Action::GetAccount {
                        account_id: "account-b".into()
                    },
                    now
                )
                .is_none()
        );
        let mutation = Action::SetTester {
            account_id: "account-a".into(),
            enabled: true,
        };
        cache.put(mutation.clone(), serde_json::json!({"ok":true}), now);
        assert!(cache.get(&mutation, now).is_none());
        cache.clear();
        assert!(cache.get(&action, now).is_none());
    }
}
