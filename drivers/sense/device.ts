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

  // Notification deduplication – see sense_guard/device.ts for rationale
  private _seenNotificationIds = new Set<string>();
  private _notificationsInitialized = false;

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
      // Use today only with groupBy=day – the aggregated endpoint stores daily averages
      // using a 'date' field (YYYY-MM-DD), not 'timestamp'. Fetch the last 7 days so
      // we always have at least one record even if today's hasn't synced yet.
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const fromDate = from.toISOString().split('T')[0];
      const data = await client.getApplianceData(this.locationId, this.roomId, this.applianceId, fromDate, undefined, 'day');

      const measurements: any[] = data?.data?.measurement ?? [];
      if (measurements.length > 0) {
        // Sort ascending by 'date' (daily aggregate field); fall back to 'timestamp'
        // for forward-compatibility if Grohe ever changes the field name.
        measurements.sort((a: any, b: any) =>
          (a.date ?? a.timestamp ?? '').localeCompare(b.date ?? b.timestamp ?? '')
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
          const msg = entry ? entry.en : `Category ${critical.category}, type ${critical.type}`;
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

      // Fire notification_received for non-critical (info/warning) unread notifications
      for (const n of unread) {
        if (n?.category === 30) continue;
        const notifId = String(n?.id ?? `${n?.category}_${n?.type}`);
        if (!this._notificationsInitialized) {
          this._seenNotificationIds.add(notifId);
          continue;
        }
        if (this._seenNotificationIds.has(notifId)) continue;
        this._seenNotificationIds.add(notifId);
        const entry = getNotification(n.category, n.type);
        const msg = entry ? entry.en : `Category ${n.category}, type ${n.type}`;
        await this.homey.flow.getDeviceTriggerCard('notification_received').trigger(this, {
          category: n.category,
          type: n.type,
          message: msg,
          severity: entry?.severity ?? 'info',
        }).catch(this.error.bind(this));
      }
      this._notificationsInitialized = true;

    } catch (err: any) {
      if (err?.code === 429) {
        this.log('Notification poll rate-limited – skipping this tick');
        return;
      }
      this.error('Sense notification poll failed:', redact(String(err)));
    }
  }
};
