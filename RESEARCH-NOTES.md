# Research Notes – Step 1

> **TODO:** Fill in after cloning reference repos per the instructions below.

## Instructions (Step 1 of the build prompt)

Clone the following repos into `./reference/` before writing or finalising any API code:

```bash
git clone https://github.com/faune/homebridge-grohe-sense ./reference/homebridge/
git clone https://github.com/gkreitz/homeassistant-grohe_sense ./reference/homeassistant/
```

Then read and verify:

### homebridge repo
- `src/ondusSession.ts` – auth flow, refresh logic, endpoint URLs
- `src/ondusPlatform.ts` – discovery flow (locations → rooms → appliances)
- `src/accessories/ondusSenseGuard.ts` – valve toggle, data parsing
- `src/accessories/ondusSense.ts` – battery status, sensor mappings
- `src/ondusAppliance.ts` – appliance type codes

### homeassistant repo
- `__init__.py` – session handling, BASE_URL, refresh flow
- `sensor.py` – full NOTIFICATION_TYPES mapping (category/type → text)
- `switch.py` – valve command

## Questions to confirm

- [ ] Base URL currently in use (`idp2-apigw.cloud.grohe.com/v3/iot/` expected)
- [ ] Exact path and body format for refresh endpoint
- [ ] Exact structure of `/appliances/{id}/data?from=` – fields in `measurement[]` and `withdrawals[]`
- [ ] Exact structure of `/appliances/{id}/notifications`
- [ ] Where battery field is found for Sense (type 101)
- [ ] Confirm valve command POST body: `{"type": 103, "command": {"valve_open": bool}}`
- [ ] Flowrate unit conversion: m³/h → l/min (verify factor `1000/60`)

## Findings

### Bekräftade (båda referensrepon)

- **Bas-URL:** `https://idp2-apigw.cloud.grohe.com/v3/iot` ✓
- **Refresh-endpoint:** POST `/oidc/refresh` med body `{"refresh_token": "..."}` ✓
- **Valve-kommando POST:** `{"type": 103, "command": {"valve_open": bool}}` ✓ (switch.py rad 60, ondusSenseGuard.ts rad 420)

### Korrigeringar jämfört med ursprunglig utredning

- **Ventilstatus:** Läses via GET `/command` → `response.command.valve_open` (INTE `/status`).
  Källa: switch.py rad 53-55, ondusSenseGuard.ts rad 366.

- **Mätfält timestamp:** Fältet heter `timestamp` (per HA sensor.py rad 140), INTE `date`.
  (Homebridge använder `/data/aggregated` – annan endpoint med annorlunda schema.)

- **Notifikationer:** API returnerar numera alla notifikationer inkl. lästa. Filtrera på `is_read === false`.
  Källa: ondusAppliance.ts rad 252 (kommentar om att beteendet ändrades).

- **Batteri (Sense typ 101):** Ligger i `/status`-endpointens array – objekt med `type === "battery"`, `value` = %.
  INTE i `/data`-svaret. Källa: ondusSense.ts rad 113-114.

- **Flowrate-enhet:** HA-koden `lambda x: x * 3.6` med utdata i m³/h tyder på att råvärdet är **l/s**
  (1 l/s = 3.6 m³/h). Homey-appen konverterar med `* 60` för l/min.
  OBS: Homebridge lagrar råvärdet utan konvertering (ondusSenseGuard.ts rad 323).
  Kräver verifiering mot verklig hårdvara.

- **Pressure-enhet:** HA konverterar `x * 1000` till mbar, dvs råvärdet är **bar**. Homey lagrar i bar. ✓

### Öppna frågor (kräver hårdvara)

- Exakt enhetsformel för flowrate (l/s antagande baserat på HA-analys)
- Om `measure_now`-kommandot stöds på Sense Guard (typ 103)
