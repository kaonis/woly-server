# WebSocket Session Token Rotation Runbook

This runbook describes how to rotate the WebSocket node session token signing secret without breaking active deployments.

## Background

The C&C WebSocket endpoint (`/ws/node`) can accept short-lived session tokens signed with HS256.

Configuration:
- `WS_SESSION_TOKEN_SECRETS`: comma-separated list. The first secret is used to sign new tokens. All secrets are accepted for verification.
- `WS_SESSION_TOKEN_TTL_SECONDS`: lifetime of issued tokens.
- `WS_SESSION_TOKEN_ISSUER`, `WS_SESSION_TOKEN_AUDIENCE`: verification constraints.

## Rotation Procedure

1. Generate a new secret value.
2. Deploy with both secrets, new first:
   - `WS_SESSION_TOKEN_SECRETS=newSecret,oldSecret`
3. Wait at least `WS_SESSION_TOKEN_TTL_SECONDS` (plus a safety buffer) so all tokens signed with `oldSecret` expire.
4. Deploy again with only the new secret:
   - `WS_SESSION_TOKEN_SECRETS=newSecret`

## Validation

- Confirm nodes can connect with both newly issued tokens and tokens issued before rotation during the overlap window.
- Confirm unauthorized tokens are rejected before upgrade (HTTP 401).

## Emergency Rollback

If node connections start failing after rotation:

1. Re-deploy with the previous secret list ordering:
   - `WS_SESSION_TOKEN_SECRETS=oldSecret,newSecret`
2. Investigate configuration drift (`ISSUER`, `AUDIENCE`, TTL).

