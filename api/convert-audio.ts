export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' });
    }
    const { audioBase64 } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ error: 'Se requiere audioBase64' });
    }

    const outputBuf = Buffer.from(audioBase64, 'base64');
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', outputBuf.length);
    return res.status(200).send(outputBuf);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Error en audio' });
  }
}
