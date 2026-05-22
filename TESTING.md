# Manual Testing Checklist

## Pairing

- [ ] Pair with valid username/password → devices appear
- [ ] Pair with invalid credentials → clear error message, no stack trace shown
- [ ] Pair with refresh token (manual OIDC flow) → devices appear
- [ ] Pair with malformed refresh token (not starting with `eyJ`) → rejected with clear error

## Capabilities

- [ ] `onoff` reflects current valve state after pairing
- [ ] `measure_water` updates with flowrate in l/min
- [ ] `measure_pressure` updates with pressure in bar
- [ ] `measure_temperature` updates with temperature in °C
- [ ] `meter_water` resets to 0 at midnight and accumulates withdrawals
- [ ] `alarm_water` false when no critical notifications
- [ ] `measure_battery` updates for Sense devices

## Valve control

- [ ] `allow_valve_control = false` (default) → closing valve via app throws error
- [ ] Enable `allow_valve_control = true` → valve can be opened/closed
- [ ] Rapid valve commands (< 10s) → second command rate-limited
- [ ] Timeline entry created for each valve change

## Alarms

- [ ] Simulated category 30 notification → `alarm_water = true` + timeline notification
- [ ] Remove category 30 notification → `alarm_water` resets to false

## Resilience

- [ ] Network disconnected for 5 minutes → reconnects and resumes polling
- [ ] API returns 429 → poll skipped for that tick, resumes next tick
- [ ] API returns 401 → token refreshed, retry succeeds

## Token lifecycle

- [ ] Wait > 1 hour → token refresh occurs transparently
- [ ] Inject expired refresh token → device marked unavailable, re-pair prompt shown
- [ ] Unpair device → stored tokens cleared (verify no stale data in settings)
- [ ] Re-pair after unpair → works cleanly

## Security checks

- [ ] No tokens/passwords in Homey log output
- [ ] No `console.log` in built JS files
- [ ] `grep -r "console\." --include="*.js" .` returns empty
- [ ] `grep -r "password\|Bearer" --include="*.js" .` shows only redact-wrapped usages
