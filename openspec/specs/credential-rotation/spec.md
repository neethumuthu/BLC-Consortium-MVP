# Credential Rotation Specification

## Purpose

Lets an institution change its own backend API credential at runtime, replacing the current redeploy-only process, without introducing per-user accounts.

## Requirements

### Requirement: Change the shared institution credential
An authenticated caller (using the current credential) SHALL be able to replace it with a new credential, without a backend redeploy.

#### Scenario: Successful credential change
- **WHEN** a caller presents the correct current credential along with a new credential
- **THEN** the credential is updated, and subsequent requests must use the new credential — the old one no longer authenticates

#### Scenario: Wrong current credential is rejected
- **WHEN** a caller presents an incorrect current credential
- **THEN** the change is rejected and the existing credential remains unchanged

### Requirement: Existing request authentication is unaffected
Every existing endpoint SHALL continue to authenticate exactly as it does today (`Authorization: Bearer <credential>`, checked on every request) — this change only affects where the expected value comes from, not the authentication mechanism itself.

#### Scenario: Normal requests still require the current credential
- **WHEN** any existing endpoint is called with the current (possibly just-changed) credential
- **THEN** the request is authenticated exactly as before

#### Scenario: Requests with the old, since-replaced credential are rejected
- **WHEN** a request is made using a credential that has since been replaced
- **THEN** the request is rejected as unauthenticated, the same as any other wrong credential today
