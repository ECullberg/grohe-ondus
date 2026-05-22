# Sense Guard Connector for Homey

Integrate **Grohe Sense Guard** (water shut-off valve) and **Grohe Sense / Sense Plus** (leak sensors) with [Athom Homey Pro](https://homey.app).

## Disclaimer

This is a community-developed integration. It is not affiliated with,
endorsed by, or supported by GROHE AG or SenseGuard GmbH. The integration
communicates with the GROHE Sense cloud API – the same API used by the
official Ondus mobile app.

The GROHE Sense App Terms of Use (as reviewed at time of development) do
not expressly prohibit third-party clients or alternative access to the
API. However, GROHE reserves the right under § 4.3 of those Terms to
suspend accounts at their discretion. By using this app, you accept that:

- Your GROHE account credentials are entrusted to a community-developed
  application
- GROHE may at any time change or restrict their API, which could break
  this app without notice
- Automatic valve control can shut off your home's water supply
- The author of this app is not liable for any damages resulting from the
  use of this software, including water-related damage from valve control

## Privacy and credential handling

Per GROHE's own Terms of Use § 4.1.2, you are responsible for keeping
your account credentials secure. This app stores your GROHE
authentication tokens encrypted in Homey's local storage and never
transmits them to any third-party server other than GROHE's own API
endpoints. No telemetry, analytics, or usage tracking is implemented.

---

## Supported devices

| Device | Type code | Capabilities |
|---|---|---|
| Grohe Sense Guard | 103 | Valve on/off, flow rate, pressure, temperature, water alarm, daily consumption |
| Grohe Sense | 101 | Water alarm, temperature, humidity, battery |
| Grohe Sense Plus | 102 | Water alarm, temperature, humidity, battery |

## Pairing

### Method 1 – username/password

1. Open Homey app → Devices → Add device → Sense Guard Connector
2. Enter your Grohe/Ondus account email and password
3. Select which devices to add

### Method 2 – refresh token (manual OIDC)

If username/password login no longer works (Grohe sometimes changes auth endpoints):

1. Open a browser and log in via: `https://idp2-apigw.cloud.grohe.com/v3/iot/oidc/login`
2. After login, you will be redirected to a URL containing a `refresh_token` parameter
3. Copy the full URL and paste it into the pairing dialog
4. The app extracts only the `refresh_token` from the URL – the URL itself is not stored

For a step-by-step guide with screenshots, see the [openHAB community wiki](https://community.openhab.org/t/grohe-ondus-binding).

## Known limitations

- **~15 minute latency** – Grohe pushes measurements to the cloud every 15 minutes. There is no webhook or push notification support; the app polls.
- **Battery-powered Sense sensors** report data once per day to conserve battery.
- **No real-time flow alerts** – high-flow detection triggers are based on polled data.
- **Cloud-only** – all communication goes through Grohe's cloud. No local LAN control.

## Reporting issues

Before sharing logs, please remove any tokens, passwords, or account identifiers. Logs can be copied from the Homey Developer Tools (`https://tools.developer.homey.app`).

Report issues at: https://github.com/ebite/com.ebite.groheondus/issues

## Compliance note

See [SECURITY.md](SECURITY.md) for security policy. Relevant Terms of Use clauses reviewed:
§ 4.1.2 (credential security), § 4.1.3 (own devices only), § 4.1.4 (device removal), § 4.3 (suspension risk), § 8 (ToS change notice).
