import { OAuth2Client, OAuth2Token, OAuth2Error } from 'homey-oauth2app';
import { redact } from './redact';

const API_BASE = 'https://idp2-apigw.cloud.grohe.com/v3/iot';
const OIDC_LOGIN_URL = `${API_BASE}/oidc/login`;
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
  static AUTHORIZATION_URL = OIDC_LOGIN_URL;

  // ── Token acquisition ──────────────────────────────────────────────────────

  async onGetTokenByCredentials({ username, password }: { username: string; password: string }): Promise<OAuth2Token> {
    try {
      // Step 1: GET the OIDC login page to get the Keycloak action URL + session cookie
      const loginPage = await fetch(OIDC_LOGIN_URL, { redirect: 'follow' });
      if (!loginPage.ok) {
        throw new OAuth2Error(`Could not reach Grohe login page: ${loginPage.status}`);
      }

      const html = await loginPage.text();
      const sessionCookie = loginPage.headers.get('set-cookie') ?? '';

      // Extract the form action URL from the HTML
      const actionMatch = html.match(/action="([^"]+)"/);
      if (!actionMatch) {
        throw new OAuth2Error('Could not find login form action URL in Grohe login page');
      }
      const actionUrl = actionMatch[1].replace(/&amp;/g, '&');

      // Parse ALL hidden input fields from the form (Keycloak sends execution token etc.)
      const hiddenFields: Record<string, string> = {};
      const inputRegex = /<input[^>]+type="hidden"[^>]*>/gi;
      let inputMatch;
      while ((inputMatch = inputRegex.exec(html)) !== null) {
        const nameMatch = inputMatch[0].match(/name="([^"]+)"/);
        const valueMatch = inputMatch[0].match(/value="([^"]*)"/);
        if (nameMatch) hiddenFields[nameMatch[1]] = valueMatch ? valueMatch[1] : '';
      }

      // Step 2: POST credentials – do NOT follow the ondus:// redirect
      const params = new URLSearchParams({ ...hiddenFields, username, password });
      const credResponse = await fetch(actionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': sessionCookie,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': actionUrl,
          'Origin': OIDC_LOGIN_URL,
        },
        body: params.toString(),
        redirect: 'manual',
      });

      const location = credResponse.headers.get('location') ?? '';
      if (!location) {
        throw new OAuth2Error('Login failed – no redirect received. Check credentials.');
      }

      // Step 3: Convert ondus:// redirect to https:// and GET to receive tokens
      const tokenUrl = location.replace('ondus://', 'https://');
      const tokenResponse = await fetch(tokenUrl, {
        headers: { 'Cookie': sessionCookie },
      });

      if (!tokenResponse.ok) {
        throw new OAuth2Error(`Token exchange failed: ${tokenResponse.status}`);
      }

      const data = (await tokenResponse.json()) as GroheToken;
      this.log('OIDC login successful');
      this._checkTandC(data);
      return this._buildToken(data);
    } catch (err) {
      this.error('OIDC login failed:', redact(String(err)));
      throw err;
    }
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

  async getApplianceData(
    locationId: string, roomId: string, applianceId: string,
    fromIsoDate: string, toIsoDate?: string,
    groupBy?: 'hour' | 'day' | 'week' | 'month' | 'year',
  ): Promise<any> {
    let query = `from=${fromIsoDate}`;
    if (toIsoDate) query += `&to=${toIsoDate}`;
    if (groupBy) query += `&groupBy=${groupBy}`;
    return this._get(`/locations/${locationId}/rooms/${roomId}/appliances/${applianceId}/data/aggregated?${query}`);
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
    const token = await this.onRefreshToken();
    this.setToken({ token });
    await this.save();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _refreshPromise: Promise<void> | null = null;

  private async _ensureFreshToken(): Promise<void> {
    // Coalesce concurrent refresh attempts into a single call
    if (!this._refreshPromise) {
      this._refreshPromise = this.onRefreshToken()
        .then((token) => {
          this.setToken({ token });
          return this.save();
        })
        .finally(() => { this._refreshPromise = null; });
    }
    return this._refreshPromise;
  }

  private async _get(path: string): Promise<any> {
    const url = `${API_BASE}${path}`;
    this.log(`GET ${url.replace(API_BASE, '[API]')}`);

    let token = this.getToken() as any;
    let response = await fetch(url, {
      headers: { Authorization: `Bearer ${token?.access_token ?? ''}` },
    });
    this.log(`GET ${url.replace(API_BASE, '[API]')} → ${response.status}`);

    if (response.status === 401) {
      await this._ensureFreshToken();
      token = this.getToken() as any;
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token?.access_token ?? ''}` },
      });
      this.log(`GET ${url.replace(API_BASE, '[API]')} retry → ${response.status}`);
    }

    return this._handleResponse(response);
  }

  private async _post(path: string, body: unknown): Promise<any> {
    let token = this.getToken() as any;
    let response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      await this._ensureFreshToken();
      token = this.getToken() as any;
      response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token?.access_token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    }

    return this._handleResponse(response);
  }

  private async _handleResponse(response: Response): Promise<any> {
    if (response.status === 429) {
      throw Object.assign(new Error('Rate limited by Grohe API'), { code: 429 });
    }
    if (response.status === 401) {
      throw new OAuth2Error('Authentication failed – re-pairing required');
    }
    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  private _buildToken(data: GroheToken): OAuth2Token {
    const token = new OAuth2Token({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: 'Bearer',
      expires_in: data.expires_in,
    });
    // Store extra fields directly on the instance (persisted via homey-oauth2app session storage)
    (token as any).refresh_token_expires_at = Date.now() + data.refresh_expires_in * 1000;
    (token as any).tandc_accepted = data.tandc_accepted ?? true;
    return token;
  }

  private _checkTandC(data: GroheToken): void {
    if (data.tandc_accepted === false) {
      this.log('WARNING: Grohe terms & conditions not accepted – user must open Ondus app');
      this._tandcPending = true;
    } else {
      this._tandcPending = false;
    }
  }

  private _tandcPending = false;
  isTandCPending(): boolean { return this._tandcPending; }
}
