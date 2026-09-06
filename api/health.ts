export default function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY_1);
  return res.status(200).json({
    status: 'ok',
    geminiKeyConfigured: hasKey,
    supportedModels: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    serverTime: new Date().toISOString()
  });
}
