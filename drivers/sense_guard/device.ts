import { OAuth2Device } from 'homey-oauth2app';
import OndusClient from '../../lib/OndusClient';
import { safeNumber } from '../../lib/safeNumber';
import { redact } from '../../lib/redact';
import { getNotification } from '../../lib/notifications';

// HA sensor.py: `lambda x: x * 3.6` with unit m³/h implies raw value is l/s (1 l/s = 3.6 m³/h).
// For Homey measure_water in l/min: 1 l/s = 60 l/min.
// Needs hardware verification – homebridge stores the raw value without conversion.
const FLOWRATE_LS_TO_LMIN = 60;

module.exports = class SenseGuardDevice extends OAuth2Device {
  private locationId!: string;
  private roomId!: string;
  private applianceId!: string;

  private _statusInterval?: NodeJS.Timeout;
  private _dataInterval?: NodeJS.Timeout;
  private _notifInterval?: NodeJS.Timeout;

  private _lastValveCommand = 0;
  private _leakActive = false;
  private _valveOpen = false;

  async onOAuth2Init() {
    const { locationId, roomId, applianceId } = this.getStore();
    this.locationId = locationId;
    this.roomId = roomId;
    this.applianceId = applianceId;

    this.registerCapabilityListener('onoff', async (value: boolean) => {
      const settings = this.getSettings();
      if (!settings.allow_valve_control) {
        throw new Error(this.homey.__('errors.valve_control_disabled'));
      }
      await this._setValve(value);
    });

    await this._poll();

    const jitter = Math.floor(Math.random() * 30_000);
    const pollStatus = this.getSettings().poll_interval_status ?? 90;

    this._statusInterval = this.homey.setInterval(
      () => this._pollStatus().catch(this.error.bind(this)),
      pollStatus * 1000 + jitter,
    );
    this._dataInterval = this.homey.setInterval(
      () => this._pollData().catch(this.error.bind(this)),
      5 * 60 * 1000 + jitter,
    );
    this._notifInterval = this.homey.setInterval(
      () => this._pollNotifications().catch(this.error.bind(this)),
      60 * 1000 + jitter,
    );
  }

  async onOAuth2Deleted() {
    if (this._statusInterval) this.homey.clearInterval(this._statusInterval);
    if (this._dataInterval) this.homey.clearInterval(this._dataInterval);
    if (this._notifInterval) this.homey.clearInterval(this._notifInterval);
  }

  // ── Valve control ──────────────────────────────────────────────────────────

  private async _setValve(open: boolean) {
    const now = Date.now();
    if (now - this._lastValveCommand < 10_000) {
      throw new Error(this.homey.__('errors.valve_rate_limited'));
    }
    this._lastValveCommand = now;

    const client = this.oAuth2Client as OndusClient;
    await client.setValve(this.locationId, this.roomId, this.applianceId, open);

    await this.homey.notifications.createNotification({
      excerpt: this.homey.__('notifications.valve_changed', {
        state: open ? this.homey.__('common.open') : this.homey.__('common.closed'),
      }),
    });

    this._valveOpen = open;
    await this.homey.flow.getDeviceTriggerCard('valve_changed').trigger(this, {
      new_state: open ? this.homey.__('common.open') : this.homey.__('common.closed'),
    }).catch(this.error.bind(this));
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  private async _poll() {
    await Promise.allSettled([
      this._pollStatus(),
      this._pollData(),
      this._pollNotifications(),
    ]);
  }

  private async _pollStatus() {
    try {
      const client = this.oAuth2Client as OndusClient;
      // Valve state comes from GET /command, not /status (confirmed in both reference repos)
      const cmd = await client.getApplianceCommand(this.locationId, this.roomId, this.applianceId);
      const valveOpen = cmd?.command?.valve_open;
      if (typeof valveOpen === 'boolean') {
        this._valveOpen = valveOpen;
        await this.setCapabilityValue('onoff', valveOpen).catch(this.error.bind(this));
      }
    } catch (err: any) {
      if (err?.code === 429) {
        this.log('Status poll rate-limited – skipping this tick');
        return;
      }
      this.error('Status poll failed:', redact(String(err)));
    }
  }

  private async _pollData() {
    try {
      const client = this.oAuth2Client as OndusClient;
      // groupBy=day gives one running daily aggregate that Grohe updates throughout the day.
      // groupBy=hour only yields midnight data – no finer granularity available via the public API.
      const today = new Date().toISOString().split('T')[0];
      const data = await client.getApplianceData(this.locationId, this.roomId, this.applianceId, today, today, 'day');

      const measurements: any[] = data?.data?.measurement ?? [];
      const withdrawalsRaw: any[] = data?.data?.withdrawals ?? [];
      this.log(`Data: ${measurements.length} measurements, ${withdrawalsRaw.length} withdrawals`);
      if (measurements.length > 0) {
        // Daily aggregate – sort by date field; last element is the most recent
        measurements.sort((a: any, b: any) =>
          (a.date ?? a.timestamp ?? '').localeCompare(b.date ?? b.timestamp ?? '')
        );
        const latest = measurements[measurements.length - 1];

        const flowrate = safeNumber(latest?.flowrate);
        if (flowrate !== null) {
          await this.setCapabilityValue('measure_water', flowrate * FLOWRATE_LS_TO_LMIN).catch(this.error.bind(this));
        }
        const pressure = safeNumber(latest?.pressure);
        if (pressure !== null) {
          await this.setCapabilityValue('measure_pressure', pressure).catch(this.error.bind(this));
        }
        const temp = safeNumber(latest?.temperature_guard);
        if (temp !== null) {
          await this.setCapabilityValue('measure_temperature', temp).catch(this.error.bind(this));
        }
      }

      // Daily aggregates use 'date' (YYYY-MM-DD) on withdrawal records
      const withdrawals: any[] = withdrawalsRaw;
      const todayDate = new Date().toISOString().split('T')[0];
      let totalLiters = 0;
      for (const w of withdrawals) {
        // Support both starttime (ISO from /data) and date (YYYY-MM-DD from /data/aggregated)
        const wDate = (w?.starttime ?? w?.date ?? '').slice(0, 10);
        if (wDate === todayDate) {
          const liters = safeNumber(w?.waterconsumption);
          if (liters !== null) totalLiters += liters;
        }
      }
      this.log(`Water today: ${totalLiters} L from ${withdrawals.length} withdrawals`);
      // meter_water custom capability uses liters (L) as unit
      await this.setCapabilityValue('meter_water', totalLiters).catch(this.error.bind(this));

    } catch (err: any) {
      if (err?.code === 429) { this.log('Data poll rate-limited'); return; }
      // 404 means no historical data yet – not an error worth reporting
      if (String(err).includes('404')) { this.log('No historical data available yet'); return; }
      this.error('Data poll failed:', redact(String(err)));
    }
  }

  // ── Public API (called by driver flow listeners) ────────────────────────────

  public async requestPoll() { await this._poll(); }
  public async openValve()   { await this._setValve(true); }
  public async closeValve()  { await this._setValve(false); }
  public isLeakActive()      { return this._leakActive; }
  public isValveOpen()       { return this._valveOpen; }

  private async _pollNotifications() {
    try {
      const client = this.oAuth2Client as OndusClient;
      const notifications: any[] = await client.getApplianceNotifications(this.locationId, this.roomId, this.applianceId);

      // API now returns all notifications including read ones – filter to unread only
      const unread = notifications.filter((n: any) => n?.is_read === false);
      const criticalActive = unread.some((n: any) => n?.category === 30);

      if (criticalActive && !this._leakActive) {
        this._leakActive = true;
        await this.setCapabilityValue('alarm_water', true).catch(this.error.bind(this));

        // Find the most recent critical notification for details
        const critical = unread.find((n: any) => n?.category === 30);
        if (critical) {
          const entry = getNotification(critical.category, critical.type);
          const msg = entry ? entry.sv : `Kategori ${critical.category}, typ ${critical.type}`;
          await this.homey.notifications.createNotification({ excerpt: msg });
          await this.homey.flow.getDeviceTriggerCard('water_leak_detected').trigger(this, {
            notification_type: String(critical.type),
            notification_message: msg,
          }).catch(this.error.bind(this));
        }
      } else if (!criticalActive && this._leakActive) {
        this._leakActive = false;
        await this.setCapabilityValue('alarm_water', false).catch(this.error.bind(this));
      }

    } catch (err: any) {
      if (err?.code === 429) {
        this.log('Notification poll rate-limited – skipping this tick');
        return;
      }
      this.error('Notification poll failed:', redact(String(err)));
    }
  }
};
