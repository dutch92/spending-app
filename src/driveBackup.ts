import { buildBackup, validateBackup, type SpendingBackup } from './backup';
import { getGoogleAccessToken } from './googleDrive';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_NAME = 'Spending App';
const BACKUP_MIME = 'application/json';
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;

export type DriveBackupFile = {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
};

type DriveFile = DriveBackupFile & { mimeType?: string };
type DriveList = { files?: DriveFile[]; nextPageToken?: string };

function driveHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Authorization', 'Bearer ' + getGoogleAccessToken());
  return headers;
}

async function expectOk(response: Response): Promise<Response> {
  if (response.ok) return response;
  if (response.status === 401) {
    throw new Error('Сеанс Google истёк. Подключите Google Drive повторно.');
  }
  if (response.status === 403) {
    throw new Error('Google Drive запретил доступ (403). Проверьте разрешения приложения.');
  }
  throw new Error('Ошибка Google Drive: HTTP ' + response.status);
}

async function listFiles(query: string, pageSize = 100): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: query,
    pageSize: String(pageSize),
    fields: 'nextPageToken,files(id,name,mimeType,createdTime,size)',
    orderBy: 'createdTime desc',
  });
  const results: DriveFile[] = [];
  let pageToken: string | undefined;
  // Limit pagination in case a Drive account contains many app-managed files.
  for (let page = 0; page < 10; page++) {
    if (pageToken) params.set('pageToken', pageToken);
    const response = await expectOk(await fetch(API + '?' + params, { headers: driveHeaders() }));
    const data = await response.json() as DriveList;
    results.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return results;
}

async function getOrCreateFolder(): Promise<string> {
  const folders = await listFiles("name = 'Spending App' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  if (folders[0]) return folders[0].id;
  const response = await expectOk(await fetch(API + '?fields=id', {
    method: 'POST',
    headers: driveHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  }));
  const result = await response.json() as { id: string };
  if (!result.id) throw new Error('Google Drive не вернул ID папки.');
  return result.id;
}

export async function listDriveBackups(): Promise<DriveBackupFile[]> {
  const folders = await listFiles("name = 'Spending App' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  if (!folders[0]) return [];
  const parent = folders[0].id.replace(/'/g, "\\'");
  const files = await listFiles(
    "'" + parent + "' in parents and mimeType = 'application/json' and trashed = false"
  );
  return files.filter((f) => /^spending-app-backup-.*\.json$/.test(f.name));
}

export async function uploadDriveBackup(): Promise<{ name: string; id: string; expenses: number }> {
  const backup = await buildBackup();
  const folderId = await getOrCreateFolder();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = 'spending-app-backup-' + stamp + '.json';
  const metadata = { name, mimeType: BACKUP_MIME, parents: [folderId] };
  const boundary = 'spending-app-' + crypto.randomUUID();
  const body = new Blob([
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n',
    JSON.stringify(backup),
    '\r\n--' + boundary + '--',
  ], { type: 'multipart/related; boundary=' + boundary });
  const response = await expectOk(await fetch(UPLOAD_API + '?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: driveHeaders({ 'Content-Type': 'multipart/related; boundary=' + boundary }),
    body,
  }));
  const result = await response.json() as { id?: string; name?: string };
  if (!result.id) throw new Error('Google Drive не подтвердил сохранение копии.');
  return { id: result.id, name, expenses: backup.expenses.length };
}

export async function downloadDriveBackup(id: string): Promise<SpendingBackup> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Некорректный ID резервной копии.');
  const response = await expectOk(await fetch(API + '/' + encodeURIComponent(id) + '?alt=media', {
    headers: driveHeaders(),
  }));
  const sizeHeader = Number(response.headers.get('content-length') ?? 0);
  if (sizeHeader > MAX_DOWNLOAD_BYTES) throw new Error('Резервная копия слишком большая.');
  const text = await response.text();
  if (new Blob([text]).size > MAX_DOWNLOAD_BYTES) throw new Error('Резервная копия слишком большая.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Google Drive вернул некорректный JSON.');
  }
  return validateBackup(value);
}
