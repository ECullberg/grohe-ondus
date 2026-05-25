import { OAuth2Device } from 'homey-oauth2app';
import OndusClient from '../../lib/OndusClient';
import { safeNumber } from '../../lib/safeNumber';
import { redact } from '../../lib/redact';
import { getNotification } from '../../lib/notifications';

module.exports = class SenseDevice extends OAuth2Device {
  private locationId!: string;
  private roomId!: string;
  private applianceId!: string;

  private _dataInterval?: NodeJS.Timeout;
  private _notifInterval?: NodeJS.Timeout;
  private _leakActive = false;

  async onOAuth2Init() {
    const { locationId, roomId, applianceId } = this.getStore();
    this.locationId = locationId;
    this.roomId = roomId;
    this.applianceId = applianceId;

    await this._poll();

    const jitter = Math.floor(Math.random() * 30_000);
    // Sense reports battery data once per day – no need to poll more often
    this._dataInterval = this.homey.setInterval(
      () => this._pollData().catch(this.error.bind(this)),
      60 * 60 * 1000 + jitter,
    );
    this._notifInterval = this.homey.setInterval(
      () => this._pollNotifications().catch(this.error.bind(this)),
      60 * 1000 + jitter,
    );
  }

  async onOAuth2Deleted() {
    if (this._dataInterval) this.homey.clearInterval(this._dataInterval);
    if (this._notifInterval) this.homey.clearInterval(this._notifInterval);
  }

  private async _poll() {
    await Promise.allSettled([this._pollData(), this._pollNotifications()]);
  }

  // Public accessor for the is_leak_active flow condition (registered in app.ts)
  public isLeakActive() { return this._leakActive; }

  private async _pollData() {
    try {
      const client = this.oAuth2Client as OndusClient;
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const fromDate = from.toISOString().split('T')[0];
      const data = await client.getApplianceData(this.locationId, this.roomId, this.applianceId, fromDate);

      // Sorted by 'timestamp' field (per HA sensor.py)
      const measurements: any[] = data?.data?.measurement ?? [];
      if (measurements.length > 0) {
        measurements.sort((a: any, b: any) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const latest = measurements[measurements.length - 1];

        const temp = safeNumber(latest?.temperature);
        if (temp !== null) {
          await this.setCapabilityValue('measure_temperature', temp).catch(this.error.bind(this));
        }

        const humidity = safeNumber(latest?.humidity);
        if (humidity !== null) {
          await this.setCapabilityValue('measure_humidity', humidity).catch(this.error.bind(this));
        }
      }

      // Battery comes from /status endpoint (confirmed in homebridge ondusSense.ts)
      const statusItems: any[] = await client.getApplianceStatus(this.locationId, this.roomId, this.applianceId);
      for (const s of statusItems) {
        if (s?.type === 'battery') {
          const battery = safeNumber(s?.value);
          if (battery !== null) {
            await this.setCapabilityValue('measure_battery', battery).catch(this.error.bind(this));
          }
        }
      }

    } catch (err: any) {
      if (err?.code === 429) {
        this.log('Data poll rate-limited – skipping this tick');
        return;
      }
      this.error('Sense data poll failed:', redact(String(err)));
    }
  }

  private async _pollNotifications() {
    try {
      const client = this.oAuth2Client as OndusClient;
      const notifications: any[] = await client.getApplianceNotifications(this.locationId, this.roomId, this.applianceId);

      // API returns all notifications including read ones – filter to unread
      const unread = notifications.filter((n: any) => n?.is_read === false);
      const criticalActive = unread.some((n: any) => n?.category === 30);

      if (criticalActive && !this._leakActive) {
        this._leakActive = true;
        await this.setCapabilityValue('alarm_water', true).catch(this.error.bind(this));

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
      this.error('Sense notification poll failed:', redact(String(err)));
    }
  }
};
