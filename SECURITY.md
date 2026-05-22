# Security Policy

## Reporting a vulnerability

Please report security issues by email to **erik@ebite.se** (not as a public GitHub issue).
Include a description of the issue, steps to reproduce, and potential impact.

## Known limitations

- Authentication tokens are stored using Homey's OAuth2 storage mechanism (`homey-oauth2app`).
  Its security properties follow the Homey platform's security model. Tokens are not encrypted
  by this app beyond what Homey provides.
- No formal security audit has been performed by GROHE AG, SenseGuard GmbH, or a third party.
- This app is unofficial and is not endorsed by GROHE AG.

## Potential future hardening

- TLS certificate pinning for `idp2-apigw.cloud.grohe.com`
- Additional tamper detection on stored token data

## Recommendations for users

- Do not reuse your Grohe account password on other services.
- Revoke access in the Ondus app if you uninstall this Homey integration.
