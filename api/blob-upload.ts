import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

function readRawBody(req: any): Promise<string> {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object') return Promise.resolve(JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function asWebRequest(req: any, rawBody: string): Request {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost';
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(','));
  }
  return new Request(`${proto}://${host}${req.url || '/api/blob-upload'}`, {
    method: req.method || 'POST',
    headers,
    body: rawBody,
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Método no permitido' }));
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const body = JSON.parse(rawBody || '{}') as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request: asWebRequest(req, rawBody),
      onBeforeGenerateToken: async () => ({
        maximumSizeInBytes: MAX_AUDIO_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ purpose: 'call-audio' }),
      }),
      onUploadCompleted: async () => {
        // The browser continues with the returned URL. Nothing else is stored here.
      },
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(jsonResponse));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo preparar la subida del audio';
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
}
