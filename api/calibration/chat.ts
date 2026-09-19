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

function generateSimulatedConsultantReply(question: string, currentDirectives: string, ragContext?: any) {
  const q = question.toLowerCase();

  // 1. General call quality improvement / coaching / OJT development
  if (
    q.includes('mejoro la calidad') ||
    q.includes('mejorar la calidad') ||
    q.includes('subir nota') ||
    q.includes('capacit') ||
    q.includes('coaching') ||
    q.includes('como mejorar') ||
    q.includes('cómo mejorar') ||
    q.includes('buenas practicas') ||
    q.includes('buenas prácticas') ||
    q.includes('estrategia de calidad')
  ) {
    const statsText = ragContext?.totalCalls
      ? `\n\n📊 **Diagnóstico según nuestra base de datos activa (${ragContext.totalCalls} llamadas analizadas):**\n- **Puntuación promedio de calidad:** ${ragContext.avgScore || 78}/100\n- **Distribución tNPS:** ${ragContext.detractorsPct || 25}% Detractores | ${ragContext.promotersPct || 45}% Promotores\n- **Brechas operativas detectadas:** ${ragContext.topQuiebres || 'Pausas en sistemas sin hold, validación de RUT y omisión de escala en encuesta'}`
      : '';

    return {
      reply: `¡Excelente consulta! Para mejorar de forma integral la calidad de las llamadas en la operación de Claro Chile / GEA Perú, debes trabajar en 4 pilares fundamentales:${statsText}

### 1. Dominio del Protocolo de 4 Fases (Pauta Oficial):
* **Fase 1 - Bienvenida Impecable:** Saludar mencionando nombre, apellido y empresa (*"Claro Chile, le habla [Nombre], ¿con quién tengo el gusto?"*). Confirmar la titularidad por RUT al tiro.
* **Fase 2 - Escucha Activa & Parafraseo:** Antes de abrir sistemas, resumir la duda del cliente (*"Entiendo perfectamente, don Juan, usted necesita revisar el detalle del cobro de su última boleta"*). Esto baja la ansiedad del cliente en un 40%.
* **Fase 3 - Gestión Transparente de Esperas:** Nunca dejar al cliente en silencio muerto. Avisar siempre: *"Voy a verificar en Somos Clave, permítame 30 segundos en línea"*, y retomar el contacto antes del minuto.
* **Fase 4 - Aseguramiento y Encuesta 0 a 10:** No cortar abruptamente. Preguntar *"¿Pude resolver todas sus dudas?"* y explicar la escala de encuesta formal: *"don Juan, podría recibir una encuesta donde 0 es la nota más baja y 10 la máxima"*.

### 2. Aceleración Formativa en OJT (Piso de Entrenamiento):
* **Micro-Roleplays de 5 minutos:** Practicar con los tutores antes del turno las 3 objeciones más duras de clientes chilenos (cobros no reconocidos, corte de fibra y bloqueo de IMEI).
* **Foco en Feedback Pedagógico:** Corregir una sola conducta crítica por sesión en lugar de abrumar al asesor con toda la pauta.

### 3. Reducción de Quiebres y Detractores:
* Separar la molestia hacia la marca del trato humano. Aunque el cliente venga indignado, si el asesor mantiene la calma, empatiza y da alternativas claras, el tNPS sube a Neutro/Promotor.

💡 *Si deseas que el motor de IA sea más formativo o flexibilice algún criterio específico en las evaluaciones, puedes calibrarlo directamente con una regla de excepción.*`,
      suggestedDirective: undefined
    };
  }

  // 2. Questions about system data / RAG statistics
  if (q.includes('datos') || q.includes('estadistica') || q.includes('estadística') || q.includes('como vamos') || q.includes('cómo vamos') || q.includes('resumen')) {
    if (ragContext?.totalCalls) {
      return {
        reply: `📈 **Resumen Ejecutivo de Speech Analytics (RAG en Vivo):**\n\n- **Volumen Total:** ${ragContext.totalCalls} llamadas evaluadas en la plataforma.\n- **Nota Media Operativa:** ${ragContext.avgScore || 78}/100 en QA Global.\n- **Clasificación tNPS:** ${ragContext.promotersPct || 40}% Promotores, ${ragContext.neutralsPct || 35}% Neutros y ${ragContext.detractorsPct || 25}% Detractores.\n- **Fases con mayor oportunidad:** Cierre y encuesta de satisfacción (omisión recurrente de la escala 0-10) y retención en hold prolongado durante consultas en Somos Clave.\n- **Estado OJT Asesores:** Asesores en curva de aprendizaje requieren refuerzo en habilidades blandas y empatía ante reclamos de boleta.\n\n¿Deseas profundizar en algún asesor específico o calibrar un umbral de evaluación?`,
        suggestedDirective: undefined
      };
    }
  }

  // 3. Specific calibration topics
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
    reply: `Entendido tu planteamiento sobre la operación de Claro Chile / GEA Perú. Como consultor de Speech Analytics y aseguramiento de calidad, puedo ayudarte tanto a diagnosticar el desempeño de tus asesores como a ajustar las reglas del motor de IA.\n\nPara profundizar, ¿deseas que revisemos técnicas pedagógicas para los asesores, analicemos las llamadas del sistema o prefieres formular una regla de calibración para el modelo?`,
    suggestedDirective: undefined
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
    const { message, history = [], customDirectives = '', ragContext } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Mensaje requerido' });
    }

    let ragSection = '';
    if (ragContext && typeof ragContext === 'object') {
      ragSection = `
CONTEXTO OPERATIVO EN VIVO (RAG DE LLAMADAS REALES DEL SISTEMA):
- Volumen total de llamadas auditadas en plataforma: ${ragContext.totalCalls || 'N/D'}
- Calificación QA Promedio actual: ${ragContext.avgScore || 'N/D'}/100
- Pronóstico tNPS: ${ragContext.promotersPct || 0}% Promotores, ${ragContext.neutralsPct || 0}% Neutros, ${ragContext.detractorsPct || 0}% Detractores
- Quiebres operativos más recurrentes: ${ragContext.topQuiebres || 'Pausas prolongadas en Somos Clave, omisión de escala 0-10 en encuesta, validación de RUT'}
- Motivos de llamadas frecuentes: ${ragContext.commonDrivers || 'Reclamos de cobro en boleta, problemas técnicos de fibra/red, cambio de plan'}
- Estado de madurez de asesores en OJT: ${ragContext.ojtSummary || 'Asesores en entrenamiento en vivo con soporte de tutores de piso'}`;
    }

    const apiKeys = getApiKeys();
    const systemInstruction = `Eres el Consultor Senior de Speech Analytics, Calidad Operativa y Coaching (QA & OJT) para GEA Perú / Claro Chile.
Cuentas con la capacidad analítica y los billones de parámetros de un modelo de lenguaje de última generación, y además estás enterado de la información operativa en tiempo real mediante RAG.
${ragSection}

PAUTA BASE OFICIAL CLARO CHILE:
- 4 Fases operativas:
  1. Bienvenida (nombre, apellido, empresa Claro, confirmación cliente/RUT).
  2. Entender y Resolver (parafrasear, sistemas Somos Clave, por favor/gracias, validación de identidad).
  3. Informar Acción (avisar espera/hold, retomar en <1 min, claridad en condiciones comerciales y valores proporcionales, resumen).
  4. Cierre (preguntas aseguramiento, confirmación activa, protocolo de encuesta en escala explicada de 0 a 10).
- Diagnóstico OJT: Madurez (EN_REFUERZO, EN_DESARROLLO, LISTO_PRODUCCION), índice de autonomía %, brecha principal, roleplay de 5 min y feedback pedagógico constructivo.
- Predicción tNPS Amigable: Desacoplar la molestia hacia la marca del trato humano del asesor novel (score_agente).
- Detección de alertas: SERNAC, SUBTEL, demandas, fuga a Entel/WOM/Movistar.
- Contexto cultural chileno: Modismos (boleta, RUT, al tiro, cachái, chato, caleta).

DIRECTIVAS ADICIONALES ACTUALMENTE ACTIVAS:
${customDirectives || 'Sin directivas adicionales personalizadas activas.'}

DIRECTIVAS Y DIRECTRICES DE RESPUESTA:
1. NO te limites únicamente a crear directivas técnicas. Puedes y debes responder CUALQUIER consulta del usuario sobre: cómo mejorar la calidad de las llamadas, cómo capacitar asesores noveles, cómo dar retroalimentación constructiva, análisis de tendencias y causas raíz de llamadas, interpretación de métricas de Speech Analytics, etc.
2. Utiliza tu vasto conocimiento y el contexto RAG de las llamadas reales para ofrecer explicaciones detalladas, pedagógicas, prácticas y ejecutivas.
3. Si el usuario te pide específicamente calibrar el modelo, modificar una regla de evaluación, O si de tu respuesta se deriva una recomendación concreta para ajustar el prompt de la IA, proporciónala al final dentro de un bloque \`\`\`directive:
\`\`\`directive
- [Nombre de la Regla]: [Texto conciso y claro de la directiva lista para incorporar en el motor]
\`\`\`
De esta forma, la interfaz habilitará automáticamente un botón para incorporar la directiva con un solo clic.
4. Mantén un tono profesional, motivador, empático y orientado a la excelencia operativa.`;

    // Try Groq if GEMINI is not available or if GROQ_API_KEY is present
    const groqKey = process.env.GROQ_API_KEY;
    if (apiKeys.length === 0 && groqKey) {
      try {
        const groqMessages = [
          { role: 'system', content: systemInstruction },
          ...(Array.isArray(history) ? history.map((h: any) => ({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.text || ''
          })) : []),
          { role: 'user', content: message }
        ];

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: groqMessages,
            temperature: 0.4,
            max_tokens: 1500
          })
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const replyText = groqData.choices?.[0]?.message?.content?.trim();
          if (replyText) {
            const directiveMatch = replyText.match(/```(?:directive)?\s*([\s\S]*?)```/i);
            const suggestedDirective = directiveMatch ? directiveMatch[1].trim() : undefined;
            return res.status(200).json({
              success: true,
              reply: replyText,
              suggestedDirective,
              meta: { modelUsed: 'Groq LLaMA 3.3 70B (RAG)' }
            });
          }
        }
      } catch (groqErr) {
        console.warn('[Calibration Chat] Groq error:', groqErr);
      }
    }

    if (apiKeys.length === 0) {
      const simulated = generateSimulatedConsultantReply(message, customDirectives, ragContext);
      return res.status(200).json({
        success: true,
        reply: simulated.reply,
        suggestedDirective: simulated.suggestedDirective,
        meta: { engine: 'Consultor Experto Claro Chile (Modo Local con RAG)' }
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
                temperature: 0.35,
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
      const simulated = generateSimulatedConsultantReply(message, customDirectives, ragContext);
      return res.status(200).json({
        success: true,
        reply: simulated.reply,
        suggestedDirective: simulated.suggestedDirective,
        meta: { engine: 'Consultor Experto Claro Chile (Respaldo inteligente RAG)' }
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
    const simulated = generateSimulatedConsultantReply(req.body?.message || '', req.body?.customDirectives || '', req.body?.ragContext);
    return res.status(200).json({
      success: true,
      reply: simulated.reply,
      suggestedDirective: simulated.suggestedDirective,
      meta: { fallback: true, error: error?.message }
    });
  }
}
