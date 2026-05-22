import { OAuth2Client, OAuth2Token, OAuth2Error } from 'homey-oauth2app';
import { redact } from './redact';

const API_BASE = 'https://idp2-apigw.cloud.grohe.com/v3/iot';
const LOGIN_URL = `${API_BASE}/auth/users/login`;
const REFRESH_URL = `${API_BASE}/oidc/refresh`;

// Grohe appliance type codes
export const APPLIANCE_TYPE_SENSE_GUARD = 103;
export const APPLIANCE_TYPE_SENSE       = 101;
export const APPLIANCE_TYPE_SENSE_PLUS  = 102;

interface GroheToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  tandc_accepted?: boolean;
  refresh_token_expires_at?: number;
}

export default class OndusClient extends OAuth2Client {
  static API_URL = API_BASE;
  static TOKEN_URL = REFRESH_URL;
  static AUTHORIZATION_URL = LOGIN_URL;

  // ── Token acquisition ──────────────────────────────────────────────────────

  async onGetTokenByCredentials({ username, password }: { username: string; password: string }): Promise<OAuth2Token> {
    const response = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    // password reference deliberately left to go out of scope here
    if (!response.ok) {
      throw new OAuth2Error(`Login failed: ${response.status}`);
    }

    const data = (await response.json()) as GroheToken;
    this._checkTandC(data);
    return this._buildToken(data);
  }

  async onRefreshToken(): Promise<OAuth2Token> {
    const currentToken = this.getToken() as any;
    if (!currentToken?.refresh_token) {
      throw new OAuth2Error('No refresh token available – re-pairing required');
    }

    const response = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: currentToken.refresh_token }),
    });

    if (response.status === 401 || response.status === 403 || response.status === 410) {
      this.log('Refresh token rejected – clearing credentials');
      throw new OAuth2Error('Refresh token expired or revoked – re-pairing required');
    }

    if (!response.ok) {
      throw new OAuth2Error(`Token refresh failed: ${response.status}`);
    }

    const data = (await response.json()) as GroheToken;
    this._checkTandC(data);
    this.log('Refresh token rotated successfully (tokens redacted)');
    return this._buildToken(data);
  }

  // ── Request building ───────────────────────────────────────────────────────

  async onBuildRequest({ method, path }: { method: string; path: string }) {
    const token = this.getToken() as any;
    return {
      method,
      url: `${API_BASE}${path}`,
      headers: {
        Authorization: `Bearer ${token?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
    };
  }

  // ── API methods ────────────────────────────────────────────────────────────

  async getLocations(): Promise<any[]> {
    return this._get('/locations');
  }

  async getRooms(locationId: string): Promise<any[]> {
    return this._get(`/locations/${locationId}/rooms`);
  }

  async getAppliances(locationId: string, roomId: string): Promise<any[]> {
    return this._get(`/locations/${locationId}/rooms/${roomId}/appliances`);
  }

  async getAppliance(locationId: string, roomId: string, applianceId: string): Promise<any> {
    return this._get(`/locations/${locationId}/rooms/${roomId}/appliances/${applianceId}`);
  }

  async getApplianceData(locationId: string, roomId: string, applianceId: string, fromIsoDate: string): Promise<any> {
    return this._get(`/locations/${locationId}/rooms/${roomId}/appliances/${applianceId}/data?from=${fromIsoDate}`);
  }

  async getApplianceStatus(locationId: string, roomId: string, applianceId: string): Promise<any[]> {
    return this._get(`/locations/${locationId}/rooms/${roomId}/appliances/${applianceId}/status`);
  }

  // Returns { command: { valve_open: boolean, ... } }
  async getApplianceCommand(locationId: string, roomId: string, applianceId: string): Promise<any> {
    return this._get(`/locations/${locationId}/rooms/${roomId}/appliances/${applianceId}/command`);
  }

  async getApplianceNotifications(locationId: string, roomId: string, applianceId: string): Promise<any[]> {
    return this._get(`/locations/${locationId}/rooms/${roomId}/appliances/${applianceId}/notifications`);
  }

  async sendCommand(locationId: string, roomId: string, applianceId: string, applianceType: number, command: Record<string, unknown>): Promise<any> {
    return this._post(
      `/locations/${locationId}/rooms/${roomId}/appliances/${applianceId}/command`,
      { type: applianceType, command },
    );
  }

  async setValve(locationId: string, roomId: string, applianceId: string, open: boolean): Promise<void> {
    await this.sendCommand(locationId, roomId, applianceId, APPLIANCE_TYPE_SENSE_GUARD, { valve_open: open });
  }

  async keepaliveRefresh(): Promise<void> {
    await this.onRefreshToken();
    await this.save();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _get(path: string): Promise<any> {
    const token = this.getToken() as any;
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token?.access_token ?? ''}` },
    });
    return this._handleResponse(response);
  }

  private async _post(path: string, body: unknown): Promise<any> {
    const token = this.getToken() as any;
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return this._handleResponse(response);
  }

  private async _handleResponse(response: Response): Promise<any> {
    if (response.status === 429) {
      throw Object.assign(new Error('Rate limited by Grohe API'), { code: 429 });
    }
    if (response.status === 401) {
      // Trigger refresh and signal caller to retry
      await this.onRefreshToken();
      await this.save();
      throw Object.assign(new OAuth2Error('Token refreshed – please retry'), { code: 401 });
    }
    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  private _buildToken(data: GroheToken): OAuth2Token {
    const now = Date.now();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: 'Bearer',
      // Non-standard fields stored alongside token
      ...({
        refresh_token_expires_at: now + data.refresh_expires_in * 1000,
        tandc_accepted: data.tandc_accepted ?? true,
      } as any),
    } as OAuth2Token;
  }

  private _checkTandC(data: GroheToken): void {
    if (data.tandc_accepted === false) {
      this.log('WARNING: Grohe terms & conditions not accepted – user must open Ondus app');
    }
  }
}
