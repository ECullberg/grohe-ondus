import { OAuth2App } from 'homey-oauth2app';
import OndusClient from './lib/OndusClient';

module.exports = class GroheOndusApp extends OAuth2App {
  static OAUTH2_CLIENT = OndusClient;
  static OAUTH2_DEBUG = false;
  static OAUTH2_MULTI_SESSION = false;

  private _keepaliveInterval?: NodeJS.Timeout;
  private _expiryCheckInterval?: NodeJS.Timeout;

  async onOAuth2Init() {
    this.log('App initialized');

    // Register shared flow condition (applies to both Sense and Sense Guard devices)
    this.homey.flow
      .getConditionCard('is_leak_active')
      .registerRunListener(async (args: any) => args.device.isLeakActive());

    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    this._keepaliveInterval = this.homey.setInterval(
      () => this._keepaliveRefresh().catch(this.error.bind(this)),
      SEVEN_DAYS,
    );

    const ONE_DAY = 24 * 60 * 60 * 1000;
    this._expiryCheckInterval = this.homey.setInterval(
      () => this._checkTokenExpiry().catch(this.error.bind(this)),
      ONE_DAY,
    );

    this._checkTokenExpiry().catch(this.error.bind(this));
    this._checkTandC().catch(this.error.bind(this));
  }

  async onUninit() {
    if (this._keepaliveInterval) this.homey.clearInterval(this._keepaliveInterval);
    if (this._expiryCheckInterval) this.homey.clearInterval(this._expiryCheckInterval);
  }

  private _tandcNotifiedAt = 0;

  private async _checkTandC() {
    // Only notify once per 24 hours to avoid spamming
    if (Date.now() - this._tandcNotifiedAt < 24 * 60 * 60 * 1000) return;
    const sessions = this.getSavedOAuth2Sessions();
    for (const sessionId of Object.keys(sessions)) {
      try {
        const client = this.getOAuth2Client({ sessionId, configId: 'default' }) as OndusClient;
        if (client.isTandCPending()) {
          this._tandcNotifiedAt = Date.now();
          await this.homey.notifications.createNotification({
            excerpt: this.homey.__('errors.tandc_not_accepted'),
          });
          return;
        }
      } catch (_) { /* session not yet ready */ }
    }
  }

  private async _keepaliveRefresh() {
    const sessions = this.getSavedOAuth2Sessions();
    for (const sessionId of Object.keys(sessions)) {
      try {
        const client = this.getOAuth2Client({ sessionId, configId: 'default' }) as OndusClient;
        await client.keepaliveRefresh();
        this.log('Keepalive refresh succeeded for session');
      } catch (err) {
        this.error('Keepalive refresh failed:', err);
      }
    }
  }

  private async _checkTokenExpiry() {
    const sessions = this.getSavedOAuth2Sessions();
    for (const sessionId of Object.keys(sessions)) {
      try {
        const client = this.getOAuth2Client({ sessionId, configId: 'default' }) as OndusClient;
        const token = client.getToken();
        const expiresAt = (token as any).refresh_token_expires_at as number | undefined;
        if (!expiresAt) continue;

        const daysLeft = Math.floor((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));

        if (daysLeft < 3) {
          await this.homey.notifications.createNotification({
            excerpt: this.homey.__('warnings.token_expiring_critical', { days: String(daysLeft) }),
          });
        } else if (daysLeft < 14) {
          this.log(`Refresh token expires in ${daysLeft} days – scheduling keepalive`);
          await (client as OndusClient).keepaliveRefresh().catch(this.error.bind(this));
        }
      } catch (err) {
        this.error('Token expiry check failed:', err);
      }
    }
  }
};
