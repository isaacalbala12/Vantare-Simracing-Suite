# Sprint 6 QA Evidence

Agent-executed verification on 2026-06-05.

## Test results

| Package | Result |
|---------|--------|
| `@vantare/auth` | 18/18 tests passed |
| `@vantare/ui-core` | 130/130 tests passed |
| `@vantare/desktop` | 194/194 tests passed |

## Deployed

- Supabase edge function `validate-license` deployed to project `olhwhfaczmrmooeaoqqf`

## Manual follow-up

- Run Hub in dev and verify login against Supabase with a real account
- Confirm HWID binding on second machine returns invalid license
