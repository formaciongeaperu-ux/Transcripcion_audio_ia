/**
 * Google Drive API Service for Claro QA Speech Analytics
 * Uses standard Drive v3 REST API with OAuth Access Token
 */

export interface DriveFolderInfo {
  id: string;
  name: string;
  webViewLink: string;
}

export interface DriveUploadedFile {
  id: string;
  name: string;
  webViewLink: string;
  webContentLink?: string;
}

const DEFAULT_FOLDER_NAME = 'Claro_QA_Audios_Speech_Analytics';

/**
 * Searches for or creates a dedicated folder in Google Drive to store call audio files.
 */
export async function getOrCreateAudioFolder(
  accessToken: string,
  folderName = DEFAULT_FOLDER_NAME
): Promise<DriveFolderInfo> {
  // 1. Search if folder already exists
  const query = encodeURIComponent(
    `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error al buscar carpeta en Drive (${searchRes.status})`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    const folder = searchData.files[0];
    return {
      id: folder.id,
      name: folder.name,
      webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    };
  }

  // 2. Create new folder if it doesn't exist
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Carpeta centralizada de grabaciones de llamadas auditadas para Claro QA Speech Analytics',
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error al crear carpeta en Google Drive (${createRes.status})`);
  }

  const created = await createRes.json();
  return {
    id: created.id,
    name: created.name || folderName,
    webViewLink: `https://drive.google.com/drive/folders/${created.id}`,
  };
}

/**
 * Uploads an audio blob/file directly to Google Drive in the specified folder.
 */
export async function uploadAudioToDrive(
  accessToken: string,
  audioBlob: Blob,
  fileName: string,
  folderId?: string
): Promise<DriveUploadedFile> {
  const metadata: any = {
    name: fileName,
    mimeType: audioBlob.type || 'audio/mpeg',
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaHeader = `${delimiter}Content-Type: ${audioBlob.type || 'audio/mpeg'}\r\n\r\n`;

  const audioBuffer = await audioBlob.arrayBuffer();

  const multipartBody = new Blob([
    metadataPart,
    mediaHeader,
    new Uint8Array(audioBuffer),
    closeDelimiter,
  ]);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error al subir audio a Google Drive (${uploadRes.status})`);
  }

  const fileData = await uploadRes.json();

  // Try to make file viewable with link within organization
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
  } catch (permErr) {
    // Non-blocking if permissions can't be set publicly
    console.warn('Could not set public permission on drive file:', permErr);
  }

  return {
    id: fileData.id,
    name: fileData.name,
    webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
    webContentLink: fileData.webContentLink,
  };
}
