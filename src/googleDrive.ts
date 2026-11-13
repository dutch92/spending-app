// Google Identity Services OAuth token flow for a browser-only PWA.
// Access tokens are kept in module memory, never persisted in storage.
export const GOOGLE_CLIENT_ID = '885442413886-rgm1oasdgpe4mlv7gf8o2c9bhdgtr42u.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};
type TokenClient = {
  requestAccessToken(options?: { prompt?: string }): void;
};
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient(options: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type: string }) => void;
      }): TokenClient;
      revoke(token: string, callback: () => void): void;
    };
  };
};
declare global {
  interface Window { google?: GoogleIdentity }
}

let accessToken: string | null = null;
let expiresAt = 0;

export function isGoogleConnected(): boolean {
  return Boolean(accessToken && Date.now() < expiresAt);
}

export function connectGoogleDrive(): Promise<void> {
  if (!window.google?.accounts?.oauth2) {
    return Promise.reject(new Error('Google Identity Services ещё загружается. Проверьте интернет и повторите попытку.'));
  }
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: async (result) => {
        if (result.error || !result.access_token) {
          reject(new Error(result.error_description ?? result.error ?? 'Не удалось получить разрешение Google.'));
          return;
        }
        try {
          // Confirm the token can access Google Drive before showing "Connected".
          const response = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id),nextPageToken', {
            headers: { Authorization: 'Bearer ' + result.access_token },
          });
          if (!response.ok) {
            throw new Error('Google Drive API вернул ошибку ' + response.status + '.');
          }
          accessToken = result.access_token;
          expiresAt = Date.now() + Math.max(0, (result.expires_in ?? 3600) - 60) * 1000;
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      error_callback: (error) => reject(new Error('Не удалось открыть окно Google: ' + error.type)),
    });
    // Triggered directly by the user's button click, required for browser popups.
    client.requestAccessToken({ prompt: 'consent' });
  });
}

export function getGoogleAccessToken(): string {
  if (!isGoogleConnected() || !accessToken) {
    throw new Error('Сеанс Google истёк. Подключите Google Drive повторно.');
  }
  return accessToken;
}

export function disconnectGoogleDrive() {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => undefined);
  }
  accessToken = null;
  expiresAt = 0;
}
