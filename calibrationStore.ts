import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'node:stream';
import { text as readStreamText } from 'node:stream/consumers';
import { get, put } from '@vercel/blob';
import { DEFAULT_CUSTOM_DIRECTIVES, DEFAULT_SENSITIVITY_SETTINGS } from './qaEngine.ts';

export interface StoredCalibration {
  customDirectives: string;
  sensitivitySettings: typeof DEFAULT_SENSITIVITY_SETTINGS;
  version: string;
  updatedAt: string;
}

const BLOB_NAME = 'gea-calibration.json';
const TMP_FILE = path.join(os.tmpdir(), BLOB_NAME);

function blobToken(): string {
  const value = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  return value && value !== '[SENSITIVE]' ? value : '';
}

export function defaultCalibration(): StoredCalibration {
  return {
    customDirectives: DEFAULT_CUSTOM_DIRECTIVES,
    sensitivitySettings: { ...DEFAULT_SENSITIVITY_SETTINGS },
    version: 'v1.3.0',
    updatedAt: new Date().toISOString(),
  };
}

function normalize(raw: any): StoredCalibration {
  const base = defaultCalibration();
  const strictness = String(raw?.sensitivitySettings?.detractorStrictness || '');
  const allowed = ['flexible', 'equilibrada', 'estricta', 'moderado'];
  const mapped = strictness === 'moderado' ? 'equilibrada' : strictness;
  return {
    customDirectives: typeof raw?.customDirectives === 'string' ? raw.customDirectives : base.customDirectives,
    sensitivitySettings: {
      silenceToleranceSeconds: Number(raw?.sensitivitySettings?.silenceToleranceSeconds ?? base.sensitivitySettings.silenceToleranceSeconds) || 30,
      detractorStrictness: (allowed.includes(strictness) ? mapped : base.sensitivitySettings.detractorStrictness) as StoredCalibration['sensitivitySettings']['detractorStrictness'],
      chileanSlangTolerance: Boolean(raw?.sensitivitySettings?.chileanSlangTolerance ?? base.sensitivitySettings.chileanSlangTolerance),
      ojtPedagogicalFocus: Boolean(raw?.sensitivitySettings?.ojtPedagogicalFocus ?? base.sensitivitySettings.ojtPedagogicalFocus),
    },
    version: 'v1.3.0',
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

export function readRequestJson(req: any): Promise<any> {
  if (Buffer.isBuffer(req?.body)) {
    try {
      return Promise.resolve(req.body.length ? JSON.parse(req.body.toString('utf8')) : {});
    } catch {
      return Promise.resolve({});
    }
  }
  if (req?.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req?.body === 'string') {
    try {
      return Promise.resolve(req.body ? JSON.parse(req.body) : {});
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

async function readBlob(): Promise<StoredCalibration | null> {
  const token = blobToken();
  if (!token) return null;
  const result = await get(BLOB_NAME, { access: 'private', token, useCache: false });
  if (!result || !('stream' in result) || !result.stream) return null;
  const raw = await readStreamText(Readable.fromWeb(result.stream as import('node:stream/web').ReadableStream));
  return raw ? normalize(JSON.parse(raw)) : null;
}

export async function readCalibration(): Promise<StoredCalibration> {
  try {
    const stored = await readBlob();
    if (stored) return stored;
  } catch (err) {
    console.warn('[Calibration] No se pudo leer la calibración guardada:', err);
  }
  for (const file of [TMP_FILE, path.join(process.cwd(), 'calibration.json')]) {
    try {
      if (fs.existsSync(file)) return normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      // Sigue con el siguiente respaldo.
    }
  }
  return defaultCalibration();
}

export async function writeCalibration(
  customDirectives: string,
  sensitivitySettings: StoredCalibration['sensitivitySettings']
): Promise<StoredCalibration> {
  const next = normalize({
    customDirectives,
    sensitivitySettings,
    updatedAt: new Date().toISOString(),
  });
  const body = JSON.stringify(next);
  const token = blobToken();
  if (token) {
    await put(BLOB_NAME, body, {
      access: 'private',
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
  }
  const localFile = token ? TMP_FILE : path.join(process.cwd(), 'calibration.json');
  try {
    fs.writeFileSync(localFile, body, 'utf8');
  } catch (err) {
    if (!token) throw err;
  }
  return next;
}
