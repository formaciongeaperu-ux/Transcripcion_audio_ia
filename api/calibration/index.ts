import { DEFAULT_BASE_PROMPT } from '../../qaEngine.ts';
import { readCalibration, readRequestJson, writeCalibration } from '../../calibrationStore.ts';

function send(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    send(res, 200, { success: true });
    return;
  }

  if (req.method === 'GET') {
    const stored = await readCalibration();
    send(res, 200, {
      success: true,
      data: {
        basePrompt: DEFAULT_BASE_PROMPT,
        ...stored,
      },
    });
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestJson(req);
      const current = await readCalibration();
      const customDirectives = typeof body.customDirectives === 'string'
        ? body.customDirectives
        : current.customDirectives;
      const sensitivitySettings = body.sensitivitySettings
        ? { ...current.sensitivitySettings, ...body.sensitivitySettings }
        : current.sensitivitySettings;
      const stored = await writeCalibration(customDirectives, sensitivitySettings);
      send(res, 200, {
        success: true,
        message: 'La calibración quedó guardada. Las próximas auditorías usarán estas directivas.',
        data: {
          basePrompt: DEFAULT_BASE_PROMPT,
          ...stored,
        },
      });
    } catch (err: any) {
      send(res, 500, { success: false, error: err?.message || 'No se pudo guardar la calibración' });
    }
    return;
  }

  send(res, 405, { success: false, error: 'Método no permitido' });
}
