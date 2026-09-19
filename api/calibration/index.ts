const DEFAULT_BASE_PROMPT = `Eres un Auditor Senior de Calidad y Entrenador Operativo de Contact Center para Claro Chile.
Tu misión es auditar y evaluar con máxima precisión técnica y objetiva la llamada de atención al cliente telefónica.

PAUTA DE CALIDAD OFICIAL - 4 FASES CLARO CHILE:
Fase 1: Bienvenida e Identificación (15%)
Fase 2: Entender y Resolver la Necesidad (45%)
Fase 3: Informar y Gestionar la Solución (25%)
Fase 4: Cierre de la Atención y Encuesta (15%)`;

const DEFAULT_CUSTOM_DIRECTIVES = `- Excepción de Silencio en Carga de Sistemas: Si el asesor indica que está validando datos o esperando respuesta en Somos Clave / CRM, tolerar hasta 40 segundos de pausa operativa sin considerarlo silencio crítico.
- Tratamiento Especial en Reclamos de Boleta: Si el cliente expresa desacuerdo con el monto cobrado, evaluar la contención y claridad de la explicación del asesor. No calificar como detractor si el asesor explicó detalladamente el ciclo y los conceptos de cobro con empatía.
- Modismos y Jerga Chilena: No penalizar el uso de expresiones y modismos cotidianos chilenos (al tiro, cachái, boleta, RUT) siempre que se mantenga el marco de respeto y formalidad profesional.
- Diagnóstico OJT de Piso: Identificar de forma explícita el nivel de madurez operativa del asesor novel (En Refuerzo, En Desarrollo, Listo para Producción) y proponer un roleplay pedagógico de 5 minutos.`;

const DEFAULT_SENSITIVITY_SETTINGS = {
  silenceToleranceSeconds: 30,
  detractorStrictness: 'moderado',
  chileanSlangTolerance: true,
  ojtPedagogicalFocus: true,
};

let inMemoryCalibration = {
  customDirectives: DEFAULT_CUSTOM_DIRECTIVES,
  sensitivitySettings: { ...DEFAULT_SENSITIVITY_SETTINGS },
  version: 'v1.3.0',
  updatedAt: new Date().toISOString()
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      data: {
        basePrompt: DEFAULT_BASE_PROMPT,
        customDirectives: inMemoryCalibration.customDirectives,
        sensitivitySettings: inMemoryCalibration.sensitivitySettings,
        version: inMemoryCalibration.version,
        updatedAt: inMemoryCalibration.updatedAt
      }
    });
  }

  if (req.method === 'POST') {
    try {
      const { customDirectives, sensitivitySettings } = req.body || {};
      if (typeof customDirectives === 'string') {
        inMemoryCalibration.customDirectives = customDirectives;
      }
      if (sensitivitySettings) {
        inMemoryCalibration.sensitivitySettings = {
          ...inMemoryCalibration.sensitivitySettings,
          ...sensitivitySettings
        };
      }
      inMemoryCalibration.updatedAt = new Date().toISOString();

      return res.status(200).json({
        success: true,
        message: 'Directivas de calibración guardadas y activas en el motor de IA.',
        data: {
          basePrompt: DEFAULT_BASE_PROMPT,
          customDirectives: inMemoryCalibration.customDirectives,
          sensitivitySettings: inMemoryCalibration.sensitivitySettings,
          version: inMemoryCalibration.version,
          updatedAt: inMemoryCalibration.updatedAt
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Error al guardar' });
    }
  }

  return res.status(405).json({ success: false, error: 'Método no permitido' });
}
