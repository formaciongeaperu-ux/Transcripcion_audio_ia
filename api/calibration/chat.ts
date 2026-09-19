import { GoogleGenAI } from '@google/genai';

function getApiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEYS) {
    process.env.GEMINI_API_KEYS.split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .forEach(k => { if (!keys.includes(k)) keys.push(k); });
  }
  if (process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY.split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .forEach(k => { if (!keys.includes(k)) keys.push(k); });
  }
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && k.trim()) {
      const clean = k.trim();
      if (!keys.includes(clean)) keys.push(clean);
    }
  }
  return keys;
}

function generateSimulatedConsultantReply(question: string, currentDirectives: string) {
  const q = question.toLowerCase();

  if (q.includes('silencio') || q.includes('pausa') || q.includes('hold') || q.includes('espera')) {
    return {
      reply: `Para calibrar la detección de silencios en piso OJT, es fundamental distinguir entre **dead air por desconexión** y **pausas legítimas de navegación en Somos Clave / CRM**.\n\nEn llamadas de asesores noveles, los tiempos de consulta suelen rondar entre 20 y 45 segundos mientras buscan los procedimientos corporativos. Para evitar que la IA castigue injustamente el indicador de eficiencia TMO o tiempos de espera, te recomiendo agregar la siguiente directiva al prompt:`,
      suggestedDirective: `- Tolerancia en Búsqueda de Sistemas: Si el asesor anuncia al cliente que está verificando en Somos Clave o en el CRM, no clasificar las pausas de hasta 45 segundos como silencio crítico o quiebre de atención.`
    };
  }

  if (q.includes('detractor') || q.includes('nps') || q.includes('molest') || q.includes('enojad') || q.includes('reclamo') || q.includes('boleta') || q.includes('cobro')) {
    return {
      reply: `En los contact centers de Claro Chile, los clientes a menudo se comunican molestos por cobros en su boleta o problemas de facturación. La IA tiende a veces a calificar la llamada como DETRACTOR (0-6) basándose únicamente en el malestar del cliente hacia la empresa, descuidando el esfuerzo y empatía del asesor.\n\nPara evitar que se marque detractor injusto en quejas de boleta Claro y proteger la calificación del asesor, te recomiendo incorporar esta directiva oficial:`,
      suggestedDirective: `- Blindaje tNPS en Reclamos de Boleta: Cuando el cliente manifieste hostilidad o frustración con la facturación o cobros de Claro, pero el asesor explique los ítems con calma, valide su reclamo y ofrezca alternativas cordialmente, priorizar score_agente >= 8.5 y clasificar el pronóstico global en NEUTRO (7-8), sin penalizar la evaluación del asesor.`
    };
  }

  if (q.includes('saludo') || q.includes('bienvenida') || q.includes('nombre') || q.includes('apellido') || q.includes('interrump')) {
    return {
      reply: `En el contexto chileno, es muy común que los clientes con urgencia comiencen a explicar su problema de inmediato ("Hola, mire sabe que se me cortó la línea"), impidiendo que el asesor recite completo su nombre, apellido y bienvenida institucional.\n\nPara que la IA no marque la Fase 1 como incumplida en estos escenarios, te sugiero esta directiva de calibración:`,
      suggestedDirective: `- Flexibilidad en Bienvenida por Interrupción: Si el cliente interrumpe el saludo inicial explicando de golpe su requerimiento, considerar la bienvenida como cumplida si el asesor se presentó al menos con su nombre y retomó cordialmente el protocolo.`
    };
  }

  if (q.includes('rut') || q.includes('seguridad') || q.includes('titular') || q.includes('identidad')) {
    return {
      reply: `La validación de titularidad por RUT es una exigencia legal y de seguridad de Claro Chile. Si deseas calibrar una exigencia más rigurosa para evitar fraudes y asegurar el cumplimiento de la política de protección de datos:`,
      suggestedDirective: `- Validación Obligatoria de RUT y Titularidad: Exigir de manera obligatoria que el asesor verifique el RUT completo y al menos un dato secundario de validación antes de entregar información de saldos o tráfico. Si no se realiza, marcar quiebre de atención de severidad ALTO.`
    };
  }

  if (q.includes('cierre') || q.includes('encuesta') || q.includes('escala') || q.includes('0 a 10') || q.includes('sms')) {
    return {
      reply: `La pauta de Claro exige explicar la encuesta con la escala del 0 al 10. Sin embargo, en llamadas rápidas el cliente a veces cuelga abruptamente. Esta directiva calibra el criterio:`,
      suggestedDirective: `- Transferencia o Explicación de Encuesta: Si el asesor menciona la encuesta de satisfacción por SMS o llamada pero el cliente finaliza la llamada antes de escuchar la escala 0-10, calificar el protocolo de cierre como PARCIALMENTE CUMPLIDO (80%) sin considerarlo quiebre de servicio.`
    };
  }

  return {
    reply: `Entendido. He analizado el caso que describes en relación a la pauta de calidad Claro Chile y el contexto OJT.\n\nPara que la Inteligencia Artificial interprete con precisión esta situación en las próximas llamadas analizadas, lo más efectivo es definir una directiva con regla de excepción explícita. Aquí tienes una directiva lista para ser incorporada a tu calibración:`,
    suggestedDirective: `- Regla de Excepción Operativa: En situaciones donde se presenten particularidades no habituales en la atención, evaluar con prioridad la actitud orientada a la solución, la cortesía hacia el usuario y la no afectación de la experiencia de cliente.`
  };
}

export default async function handler(req: any, res: any) {
  // CORS
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  try {
    const { message, history = [], customDirectives = '' } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Mensaje requerido' });
    }

    const apiKeys = getApiKeys();
    const systemInstruction = `Eres el Consultor Senior de Calibración de Speech Analytics y Aseguramiento de Calidad (QA) para Contact Centers de Claro Chile.
Tu rol es orientar a supervisores, auditores de calidad y desarrolladores a calibrar y enriquecer el Prompt del motor de Inteligencia Artificial que audita las llamadas reales de los asesores.

PAUTA BASE OFICIAL CLARO CHILE:
- 4 Fases operativas: 1. Bienvenida (nombre, apellido, empresa, confirmación cliente/RUT), 2. Entender y Resolver (parafrasear, sistemas Somos Clave, por favor/gracias), 3. Informar Acción (avisar espera, retomar en <1 min, condiciones comerciales claras), 4. Cierre (preguntas aseguramiento, confirmación, encuesta escala 0-10).
- Diagnóstico OJT: Madurez (EN_REFUERZO, EN_DESARROLLO, LISTO_PRODUCCION), índice de autonomía %, brecha principal, roleplay de 5 min y feedback pedagógico constructivo.
- Predicción tNPS Amigable: Desacoplar la molestia hacia la marca del trato humano del asesor novel (score_agente).
- Detección de alertas: SERNAC, SUBTEL, demandas, fuga a Entel/WOM/Movistar.
- Contexto cultural chileno: Modismos (boleta, RUT, al tiro, cachái, chato, caleta).

DIRECTIVAS ADICIONALES ACTUALMENTE ACTIVAS:
${customDirectives}

INSTRUCCIONES DE RESPUESTA:
1. Explica de forma clara, ejecutiva y empática la razón del comportamiento de la IA ante el escenario planteado por el usuario.
2. Brinda una recomendación fundamentada en mejores prácticas operativas de contact center y Claro Chile.
3. Si recomiendas una nueva regla o ajuste textual para agregar al prompt del motor, ENTRÉGALO OBLIGATORIAMENTE en un bloque de código delimitado con \`\`\`directive:
\`\`\`directive
- [Nombre de la Regla]: [Texto claro y conciso de la directiva lista para incorporar]
\`\`\`
De esta manera, la aplicación web mostrará un botón interactivo para que el usuario pueda añadir la directiva a su prompt con un solo clic.
Mantén un lenguaje profesional, positivo y enfocado en la calibración y mejora continua.`;

    if (apiKeys.length === 0) {
      const simulated = generateSimulatedConsultantReply(message, customDirectives);
      return res.status(200).json({
        success: true,
        reply: simulated.reply,
        suggestedDirective: simulated.suggestedDirective,
        meta: { engine: 'Consultor Experto Claro Chile (Modo Local)' }
      });
    }

    // Build Gemini contents
    const validHistory: Array<{ role: 'user' | 'model'; text: string }> = [];
    if (Array.isArray(history)) {
      for (const h of history) {
        if (h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string' && h.text.trim()) {
          validHistory.push({ role: h.role, text: h.text.trim() });
        }
      }
    }

    while (validHistory.length > 0 && validHistory[0].role === 'model') {
      validHistory.shift();
    }

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const item of validHistory) {
      if (contents.length === 0) {
        if (item.role === 'user') {
          contents.push({ role: 'user', parts: [{ text: item.text }] });
        }
      } else {
        const lastTurn = contents[contents.length - 1];
        if (lastTurn.role === item.role) {
          lastTurn.parts[0].text += `\n\n${item.text}`;
        } else {
          contents.push({ role: item.role, parts: [{ text: item.text }] });
        }
      }
    }

    if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
      contents.push({ role: 'user', parts: [{ text: message }] });
    } else {
      contents[contents.length - 1].parts[0].text += `\n\n${message}`;
    }

    let rawReply = '';
    let modelUsed = '';
    const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];

    for (const key of apiKeys) {
      try {
        const ai = new GoogleGenAI({
          apiKey: key,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        for (const modelName of candidateModels) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents,
              config: {
                systemInstruction,
                temperature: 0.3,
                maxOutputTokens: 2048,
              }
            });
            const replyText = response.text?.trim();
            if (replyText) {
              rawReply = replyText;
              modelUsed = modelName;
              break;
            }
          } catch (err) {
            // try next model
          }
        }
        if (rawReply) break;
      } catch (keyErr) {
        // try next key
      }
    }

    if (!rawReply) {
      const simulated = generateSimulatedConsultantReply(message, customDirectives);
      return res.status(200).json({
        success: true,
        reply: simulated.reply,
        suggestedDirective: simulated.suggestedDirective,
        meta: { engine: 'Consultor Experto Claro Chile (Respaldo inteligente)' }
      });
    }

    const directiveMatch = rawReply.match(/```(?:directive)?\s*([\s\S]*?)```/i);
    const suggestedDirective = directiveMatch ? directiveMatch[1].trim() : undefined;

    return res.status(200).json({
      success: true,
      reply: rawReply,
      suggestedDirective,
      meta: { modelUsed }
    });

  } catch (error: any) {
    const simulated = generateSimulatedConsultantReply(req.body?.message || '', req.body?.customDirectives || '');
    return res.status(200).json({
      success: true,
      reply: simulated.reply,
      suggestedDirective: simulated.suggestedDirective,
      meta: { fallback: true, error: error?.message }
    });
  }
}
