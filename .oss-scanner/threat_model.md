# Threat model

## What OpenLeo does and where untrusted input enters
OpenLeo is a board of to-do cards worked on by AI agents. People sign in with their ChatGPT account; agents run on
that account's plan and work on the board's own Linux computer (a container), not on the host. The server is Bun
(`server/`), the web app React (`web/`), and the desktop app (`desktop/`) runs the same server locally.

Untrusted input:
- **HTTP requests** to the server (`server/http/`). Every route except sign-in goes through `server/http/guard.ts`
  (session cookie, same-origin check, tenant scope).
- **Other accounts.** Each ChatGPT account is a tenant with its own folder (`data/tenants/<id>/`); the first is the
  owner. Any way for one tenant to read or change another's boards, agents, files, chats or secrets matters most.
- **Agent output and anything the agent reads** (web pages, files, card text): treat as attacker controlled
  (prompt injection). It must not escape the board's computer, reach the host's files, or read the vault.
- **Files people upload** and names they choose (paths, board and agent names).
- **Sign-in callbacks** (OAuth with ChatGPT and GitHub).

## Components that matter most / least
Most: `server/http/guard.ts` and routes, tenant isolation (`inTenant`, `dataDir()`), the vault (`server/infra/vault.ts`:
tokens and keys, never sent to the page), path handling for files, sign-in and sessions (`server/http/auth.ts`, `server/infra/siwc.ts`, `server/infra/sessions.ts`,
`server/infra/tenant.ts`), and what agent tools
can do on the host (`server/infra/sandbox.ts`, `server/infra/runtime.ts`).
Less: the landing site (`landing/`, static), the desktop shell (`desktop/`), the computer image (`computer/`).

## How to exercise it
`bun run start` serves on http://127.0.0.1:3000. `bun test` runs the suite (`test/setup.ts` uses a temp data folder).
With `OPENLEO_SANDBOX=off` agent tools run on the host (single-owner only), which needs no container runtime.
Signing in needs a ChatGPT account and the network, so prefer tests and direct calls to `server/app` and
`server/http` functions with a tenant set up as the tests do.

## How we rate severity
- Critical: one tenant reading or changing another tenant's data or secrets; running code on the host from a
  request or from agent output; reading vault secrets.
- High: bypassing the guard (session, same-origin) on any route; path traversal out of the tenant folder; an agent
  escaping its board's computer.
- Medium: stored XSS in the web app; going past per-account limits (`LIMITS` in `server/infra/config.ts`).
- Low: denial of service by a signed-in account against its own data.

## Anything to leave alone
- `OPENLEO_SANDBOX=off` gives agents the host by design (owner only); not a finding unless another account can use it.
- The server listens on 127.0.0.1 and refuses other addresses without HTTPS; plain-HTTP setups on the network are out of scope.
- Third-party code in `node_modules/`.
