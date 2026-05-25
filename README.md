# Grohe Ondus for Homey

Integrates **Grohe Sense Guard** (water valve + sensor) and **Grohe Sense / Sense Plus** (leak sensors) with [Homey](https://homey.app).

## Supported devices

| Device | Type |
|---|---|
| Grohe Sense Guard | Water shutoff valve with pressure, temperature and flow monitoring |
| Grohe Sense | Leak sensor with temperature and humidity |
| Grohe Sense Plus | Leak sensor with temperature and humidity |

## Features

### Grohe Sense Guard
- **Water pressure** (bar) — daily average, updated throughout the day
- **Water temperature** (°C) — daily average
- **Water flow** (L/min) — daily average
- **Water used today** (L) — running daily total
- **Valve control** — open/close via Homey UI or Flows (requires opt-in in settings)
- **Water leak alarm** — triggers when Grohe reports a critical notification

### Grohe Sense / Sense Plus
- **Temperature** (°C)
- **Humidity** (%)
- **Battery level** (%)
- **Water leak alarm** — triggers on critical Grohe notification

### Homey Flows

| Card | Type | Description |
|---|---|---|
| Water leak detected | Trigger | Fires when a leak alarm becomes active on a device |
| Valve state changed | Trigger | Fires when the valve opens or closes |
| A water leak alarm is active | Condition | True if alarm is currently active |
| Valve is open | Condition | True if valve is currently open |
| Open water valve | Action | Opens the valve on a Sense Guard |
| Close water valve | Action | Closes the valve on a Sense Guard |
| Request measurement now | Action | Forces an immediate data poll |

## Installation

### Via Homey App Store
Search for **Grohe Ondus** in the Homey App Store.

### Manual / development install
```bash
git clone https://github.com/ECullberg/grohe-ondus.git
cd grohe-ondus
npm install
homey app run
```

## Configuration

### Pairing
1. Open Homey → Devices → Add device → Grohe Ondus
2. Enter your **Grohe Ondus / Grohe app** e-mail and password
3. Select your device(s) from the list

### Valve control (Sense Guard)
Valve control is **disabled by default** as a safety measure. To enable it:
1. Open the Sense Guard device settings in Homey
2. Enable **"Allow Homey to control the valve"**

> ⚠️ Only enable valve control if you understand the consequences of accidentally closing your main water supply.

## Known limitations

The Grohe cloud API only provides **daily aggregated data**. Sensor values (pressure, temperature, flow, consumption) are averages/totals for the current day, updated a few times per day as the device syncs. Real-time per-second data is not available via the public API.

Valve state and leak alarms poll more frequently (every 60–90 seconds).

## Security

- Credentials are stored exclusively via Homey's built-in OAuth2 storage — never in settings, store values or logs
- Tokens and passwords are never written to log output
- Valve control is disabled by default; a 10-second rate limit applies between commands
- No telemetry or analytics — the app only communicates with Grohe's cloud API (`idp2-apigw.cloud.grohe.com`)

## Development

```bash
npm install             # Install dependencies
npm run build           # TypeScript compile
homey app run           # Deploy to Homey (development mode)
homey app validate      # Validate app manifest
```

### Project structure

```
.homeycompose/           Homey compose source files
  app.json               App metadata
  capabilities/          Custom capability definitions (pressure in bar, water in L)
  flow/                  Flow card definitions
assets/                  App icons
drivers/
  sense/                 Grohe Sense / Sense Plus driver
  sense_guard/           Grohe Sense Guard driver
lib/
  OndusClient.ts         Grohe cloud API client (OAuth2, token refresh, data fetching)
  notifications.ts       Grohe notification type catalogue
  redact.ts              Log sanitisation helper
  safeNumber.ts          Safe numeric parsing
types/
  homey-oauth2app.d.ts   TypeScript stubs for homey-oauth2app
```

## Contributing

Pull requests are welcome. Please open an issue first to discuss larger changes.

## License

[MIT](LICENSE) © Erik Cullberg
