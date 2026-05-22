// Ambient type stubs for homey-oauth2app (no official @types package exists).
// Covers the subset of the API used by this app.
declare module 'homey-oauth2app' {

  interface HomeyInstance {
    setInterval(fn: () => void, ms: number): NodeJS.Timeout;
    clearInterval(id: NodeJS.Timeout): void;
    notifications: {
      createNotification(opts: { excerpt: string }): Promise<void>;
    };
    __: (key: string, tokens?: Record<string, string>) => string;
    emit(event: string, ...args: any[]): void;
  }

  export class OAuth2Token {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    [key: string]: any;
  }

  export class OAuth2Error extends Error {
    constructor(message: string);
  }

  export class OAuth2Client {
    log(...args: any[]): void;
    error(...args: any[]): void;
    getToken(): OAuth2Token | null;
    setToken(opts: { token: OAuth2Token }): void;
    save(): Promise<void>;
    onInit(): Promise<void>;
    onUninit(): Promise<void>;
    onGetTokenByCredentials(opts: { username: string; password: string }): Promise<OAuth2Token>;
    onRefreshToken(): Promise<OAuth2Token>;
    onBuildRequest(opts: { method: string; path: string }): Promise<any>;
    static API_URL: string;
    static TOKEN_URL: string;
    static AUTHORIZATION_URL: string;
  }

  export class OAuth2App {
    static OAUTH2_CLIENT: typeof OAuth2Client;
    static OAUTH2_DEBUG: boolean;
    static OAUTH2_MULTI_SESSION: boolean;

    homey: HomeyInstance;
    log(...args: any[]): void;
    error(...args: any[]): void;
    onOAuth2Init(): Promise<void>;
    onUninit(): Promise<void>;
    getSavedOAuth2Sessions(): Record<string, any>;
    getOAuth2Client(opts: { sessionId: string; configId: string }): OAuth2Client;
  }

  export class OAuth2Driver {
    homey: HomeyInstance;
    log(...args: any[]): void;
    error(...args: any[]): void;
    onOAuth2Init(): Promise<void>;
    onPairListDevices(opts: { oAuth2Client: OAuth2Client }): Promise<any[]>;
  }

  export class OAuth2Device {
    homey: HomeyInstance;
    oAuth2Client: OAuth2Client;
    log(...args: any[]): void;
    error(...args: any[]): void;
    onOAuth2Init(): Promise<void>;
    onOAuth2Deleted(): Promise<void>;
    getStore(): Record<string, any>;
    getSettings(): Record<string, any>;
    setCapabilityValue(capability: string, value: any): Promise<void>;
    registerCapabilityListener(capability: string, fn: (value: any) => Promise<void>): void;
  }
}
