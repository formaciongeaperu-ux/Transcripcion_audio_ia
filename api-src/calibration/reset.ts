import { DEFAULT_BASE_PROMPT } from '../../qaEngine.ts';
import { defaultCalibration, writeCalibration } from '../../calibrationStore.ts';

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
  if (req.method !== 'POST') {
    send(res, 405, { success: false, error: 'Método no permitido' });
    return;
  }

  try {
    const defaults = defaultCalibration();
    const stored = await writeCalibration(defaults.customDirectives, defaults.sensitivitySettings);
    send(res, 200, {
      success: true,
      message: 'Calibración restablecida a los valores oficiales.',
      data: {
        basePrompt: DEFAULT_BASE_PROMPT,
        ...stored,
      },
    });
  } catch (err: any) {
    send(res, 500, { success: false, error: err?.message || 'No se pudo restablecer la calibración' });
  }
}
