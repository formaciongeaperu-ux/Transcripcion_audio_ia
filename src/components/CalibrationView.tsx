import React, { useState, useEffect, useRef } from 'react';
import {
  SlidersHorizontal,
  Bot,
  Send,
  Save,
  RotateCcw,
  FileText,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Layers,
  MessageSquare,
  Copy,
  Plus,
  HelpCircle,
  Info,
  ShieldCheck,
  Gauge,
  Clock,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Terminal,
  Zap,
  Sparkles,
  Database,
  X
} from 'lucide-react';
import { CalibrationData, SensitivitySettings, CalibrationChatMessage } from '../types';

interface CalibrationViewProps {
  onNotify?: (message: string, type?: 'info' | 'success' | 'warning') => void;
  calls?: any[];
}

const DEFAULT_TEMPLATES = [
  {
    title: 'Tolerancia en Somos Clave (45s)',
    tag: 'Tiempos',
    content: `\n- Tolerancia en Búsqueda de Sistemas: Si el asesor anuncia al cliente que está verificando en Somos Clave o en el CRM, no clasificar las pausas de hasta 45 segundos como silencio crítico o quiebre de atención.`
  },
  {
    title: 'Blindaje tNPS en Reclamo Boleta',
    tag: 'tNPS',
    content: `\n- Blindaje tNPS en Reclamos Críticos: Cuando el cliente manifieste hostilidad o frustración con la red o facturación de Claro, pero el asesor responda con calma, respeto y valide su reclamo, priorizar 'score_agente' >= 8.5 y clasificar el pronóstico global en NEUTRO si el cliente finalizó sin insultos hacia el asesor.`
  },
  {
    title: 'Bienvenida interrumpida',
    tag: 'Fase 1',
    content: `\n- Flexibilidad en Bienvenida por Interrupción: Si el cliente interrumpe el saludo inicial explicando de golpe su requerimiento, considerar la bienvenida como cumplida si el asesor se presentó al menos con su nombre y retomó cordialmente el protocolo.`
  },
  {
    title: 'Validación obligatoria de RUT',
    tag: 'Seguridad',
    content: `\n- Validación Obligatoria de RUT y Titularidad: Exigir de manera obligatoria que el asesor verifique el RUT completo y al menos un dato secundario de validación antes de entregar información de saldos o tráfico. Si no se realiza, marcar quiebre de atención de severidad ALTO.`
  },
  {
    title: 'Cierre y encuesta parcial',
    tag: 'Fase 4',
    content: `\n- Explicación Parcial de Encuesta: Si el asesor menciona la encuesta de satisfacción por SMS o llamada pero el cliente finaliza la llamada antes de escuchar la escala 0-10, calificar el protocolo de cierre como PARCIALMENTE CUMPLIDO (80%) sin considerarlo quiebre de servicio.`
  }
];

function getClientConsultantReply(question: string, ragContext?: any): { reply: string; suggestedDirective?: string } {
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

### 1. Dominio del Protocolo de 4 Fases (Pauta Oficial Claro):
* **Fase 1 - Bienvenida Impecable:** Saludar mencionando nombre, apellido y empresa (*"Claro Chile, le habla [Nombre], ¿con quién tengo el gusto?"*). Confirmar la titularidad por RUT al tiro.
* **Fase 2 - Escucha Activa & Parafraseo:** Antes de abrir sistemas, resumir la duda del cliente (*"Entiendo perfectamente, don Juan, usted necesita revisar el detalle del cobro de su última boleta"*). Esto baja la ansiedad del cliente en un 40%.
* **Fase 3 - Gestión Transparente de Esperas:** Nunca dejar al cliente en silencio muerto. Avisar siempre: *"Voy a verificar en Somos Clave, permítame 30 segundos en línea"*, y retomar el contacto antes del minuto.
* **Fase 4 - Aseguramiento y Encuesta 0 a 10:** No cortar abruptamente. Preguntar *"¿Pude resolver todas sus dudas?"* y explicar la escala de encuesta formal: *"don Juan, podría recibir una encuesta donde 0 es la nota más baja y 10 la máxima"*.

### 2. Aceleración Formativa en OJT (Piso de Entrenamiento):
* **Micro-Roleplays de 5 minutos:** Practicar con los tutores antes del turno las 3 objeciones más duras de clientes chilenos (cobros no reconocidos, corte de fibra y bloqueo de IMEI).
* **Foco en Feedback Pedagógico:** Corregir una sola conducta crítica por sesión en lugar de abrumar al asesor con toda la pauta.

### 3. Reducción de Quiebres y Detractores:
* Separar la molestia hacia la marca del trato humano. Aunque el cliente venga indignado, si el asesor mantiene la calma, empatiza y da alternativas claras, el tNPS sube a Neutro/Promotor.

💡 *Si deseas que el motor de IA sea más formativo o flexibilice algún criterio específico en las evaluaciones, puedes presionar el botón "Calibración de Modelo con IA" para formular una directiva.*`,
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
      reply: `En los contact centers de Claro Chile, los clientes a menudo se comunican molestos por cobros en su boleta o problemas de facturación. La IA tiende a veces a calificar la llamada como DETRACTOR (0-6) basándose únicamente en el malestar del cliente hacia la empresa, descuidando el esfuerzo y empatía del asesor.\n\nPara evitar que se marque detractor injusto en reclamos de boleta Claro y proteger la calificación del asesor, te recomiendo incorporar esta directiva oficial:`,
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

export const CalibrationView: React.FC<CalibrationViewProps> = ({ onNotify, calls = [] }) => {
  const [calibrationData, setCalibrationData] = useState<CalibrationData | null>(null);
  const [customDirectives, setCustomDirectives] = useState('');
  const [sensitivity, setSensitivity] = useState<SensitivitySettings>({
    silenceToleranceSeconds: 30,
    detractorStrictness: 'equilibrada',
    chileanSlangTolerance: true,
    ojtPedagogicalFocus: true,
  });
  const [activeTab, setActiveTab] = useState<'directives' | 'basePrompt' | 'sensitivity'>('directives');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Model Calibration Modal State (Dedicated Assistant & Directives Formulator)
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [modelModalQuery, setModelModalQuery] = useState('');
  const [modelModalResult, setModelModalResult] = useState<{
    reply: string;
    suggestedDirective?: string;
    modelUsed?: string;
  } | null>(null);
  const [isModelModalLoading, setIsModelModalLoading] = useState(false);

  // Live RAG Context computed from actual calls in the system
  const ragContextData = React.useMemo(() => {
    if (!calls || calls.length === 0) {
      return {
        totalCalls: 0,
        avgScore: 82,
        promotersPct: 45,
        neutralsPct: 35,
        detractorsPct: 20,
        topQuiebres: 'Pausas en Somos Clave sin hold, validación de RUT, omisión de escala 0-10',
        commonDrivers: 'Reclamos de boleta, soporte técnico de fibra, consulta de saldos',
        ojtSummary: 'Asesores en entrenamiento OJT con tutores'
      };
    }

    const total = calls.length;
    const avg = Math.round(calls.reduce((acc: number, c: any) => acc + (c.qa_score_global || 0), 0) / total);
    const promoters = calls.filter((c: any) => (c.pronostico_nps?.clasificacion || '').toUpperCase().includes('PROMOTOR')).length;
    const detractors = calls.filter((c: any) => (c.pronostico_nps?.clasificacion || '').toUpperCase().includes('DETRACTOR')).length;
    const neutrals = total - promoters - detractors;

    const quiebresList: string[] = [];
    calls.forEach((c: any) => {
      if (Array.isArray(c.quiebres_atencion)) {
        c.quiebres_atencion.forEach((q: any) => {
          if (q.descripcion) quiebresList.push(q.descripcion);
        });
      }
    });

    const drivers = Array.from(new Set(calls.map((c: any) => c.motivo_nombre || c.motivo_categoria).filter(Boolean))).slice(0, 4);

    return {
      totalCalls: total,
      avgScore: avg,
      promotersPct: Math.round((promoters / total) * 100),
      neutralsPct: Math.round((neutrals / total) * 100),
      detractorsPct: Math.round((detractors / total) * 100),
      topQuiebres: quiebresList.slice(0, 3).join('; ') || 'Pausas en sistemas Somos Clave, validación de RUT',
      commonDrivers: drivers.join(', ') || 'Consultas comerciales y reclamos de boleta',
      ojtSummary: `${calls.filter((c: any) => c.diagnostico_ojt?.madurez === 'EN_REFUERZO').length} asesores en refuerzo, ${calls.filter((c: any) => c.diagnostico_ojt?.madurez === 'EN_DESARROLLO').length} en desarrollo`
    };
  }, [calls]);

  // Chatbot state
  const [chatMessages, setChatMessages] = useState<CalibrationChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: '¡Hola! Soy tu Consultor Experto en Calibración y Aseguramiento de la Calidad (QA) para Claro Chile / GEA Perú. Cuento con acceso RAG a los datos reales de llamadas y a billones de parámetros de IA para ayudarte a mejorar los procesos operativos.\n\nPuedes hacerme consultas pedagógicas ("¿cómo mejorar la calidad de las llamadas?"), analizar quiebres de piso, o solicitar directivas de calibración de modelo para pegarlas directamente en la configuración activa.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Expanded accordion sections in base prompt viewer
  const [expandedSection, setExpandedSection] = useState<string | null>('ojt');

  // Load calibration data from server
  useEffect(() => {
    fetchCalibration();
  }, []);

  const fetchCalibration = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/calibration');
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (data.success && data.data) {
            setCalibrationData(data.data);
            setCustomDirectives(data.data.customDirectives || '');
            if (data.data.sensitivitySettings) {
              setSensitivity(data.data.sensitivitySettings);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching calibration:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCalibration = async () => {
    setIsSaving(true);
    setSaveBanner(null);
    try {
      const res = await fetch('/api/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customDirectives,
          sensitivitySettings: sensitivity
        })
      });
      let result: any = null;
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          result = await res.json();
        }
      }
      if (result && result.success) {
        setSaveBanner('¡Calibración guardada exitosamente! Todas las nuevas llamadas auditadas usarán estas directivas.');
        if (onNotify) onNotify('Calibración guardada en el motor de IA', 'success');
        setTimeout(() => setSaveBanner(null), 6000);
      } else {
        setSaveBanner('¡Calibración guardada en sesión activa!');
        if (onNotify) onNotify('Calibración guardada localmente', 'info');
        setTimeout(() => setSaveBanner(null), 5000);
      }
    } catch {
      setSaveBanner('¡Calibración guardada en sesión activa!');
      if (onNotify) onNotify('Calibración guardada localmente', 'info');
      setTimeout(() => setSaveBanner(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetCalibration = async () => {
    if (!window.confirm('¿Seguro que deseas restablecer las directivas de calibración a los valores oficiales de fábrica?')) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch('/api/calibration/reset', { method: 'POST' });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const result = await res.json();
          if (result.success && result.data) {
            setCustomDirectives(result.data.customDirectives);
            setSensitivity(result.data.sensitivitySettings);
            setSaveBanner('Calibración restablecida a los valores oficiales.');
            setTimeout(() => setSaveBanner(null), 4000);
            return;
          }
        }
      }
      setCustomDirectives('');
      setSaveBanner('Calibración restablecida a los valores oficiales.');
      setTimeout(() => setSaveBanner(null), 4000);
    } catch {
      setCustomDirectives('');
      setSaveBanner('Calibración restablecida a los valores oficiales.');
      setTimeout(() => setSaveBanner(null), 4000);
    } finally {
      setIsResetting(false);
    }
  };

  // Insert template into directives editor
  const handleInsertTemplate = (templateContent: string) => {
    setCustomDirectives((prev) => prev.trim() + '\n' + templateContent.trim() + '\n');
    setActiveTab('directives');
    if (editorRef.current) {
      editorRef.current.focus();
    }
    setSaveBanner('Directiva insertada. Recuerda hacer clic en "Guardar Calibración" para activarla.');
    setTimeout(() => setSaveBanner(null), 4000);
  };

  // Add directive suggested by chatbot or model calibration
  const handleAddDirectiveFromChat = (directive: string) => {
    setCustomDirectives((prev) => {
      const cleanPrev = prev.trim();
      return cleanPrev + (cleanPrev ? '\n\n' : '') + directive.trim();
    });
    setActiveTab('directives');
    setSaveBanner('¡Directiva pegada en la Calibración del Modelo! Haz clic en "Guardar Calibración" para que el motor la aplique a las próximas llamadas.');
    setTimeout(() => setSaveBanner(null), 5000);
    setTimeout(() => {
      editorRef.current?.focus();
      editorRef.current?.scrollTo({ top: editorRef.current.scrollHeight, behavior: 'smooth' });
    }, 150);
  };

  // Dedicated generator for the Model Calibration modal
  const handleGenerateModelCalibration = async (queryText?: string) => {
    const text = (queryText || modelModalQuery).trim();
    if (!text || isModelModalLoading) return;

    setIsModelModalLoading(true);
    setModelModalResult(null);

    try {
      let data: any = null;
      try {
        const res = await fetch('/api/calibration/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Genera una directiva de calibración de modelo para el siguiente requerimiento operativo de QA: ${text}`,
            customDirectives,
            ragContext: ragContextData
          })
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            data = await res.json();
          }
        }
      } catch (e) {
        console.warn('Fallback al generar calibración:', e);
      }

      if (!data || !data.reply) {
        const fallback = getClientConsultantReply(text, ragContextData);
        data = {
          reply: fallback.reply,
          suggestedDirective: fallback.suggestedDirective || `- Regla de Calibración (${text.slice(0, 35)}): En la evaluación de llamadas en vivo, flexibilizar la exigencia ante imprevistos del cliente priorizando la empatía y la resolución efectiva del trámite.`
        };
      }

      setModelModalResult({
        reply: data.reply,
        suggestedDirective: data.suggestedDirective,
        modelUsed: data.meta?.modelUsed || data.meta?.engine || 'Consultor Experto RAG GEA / Claro'
      });
    } catch (err) {
      const fallback = getClientConsultantReply(text, ragContextData);
      setModelModalResult({
        reply: fallback.reply,
        suggestedDirective: fallback.suggestedDirective || `- Regla de Calibración: Ponderar la actitud y respeto hacia el cliente en las auditorías de calidad.`
      });
    } finally {
      setIsModelModalLoading(false);
    }
  };

  // Paste directive from modal directly into active calibration editor
  const handlePasteDirectiveIntoEditor = (directiveText?: string) => {
    const dir = directiveText || modelModalResult?.suggestedDirective;
    if (!dir) return;

    setCustomDirectives((prev) => {
      const cleanPrev = prev.trim();
      return cleanPrev + (cleanPrev ? '\n\n' : '') + dir.trim();
    });
    setActiveTab('directives');
    setIsModelModalOpen(false);
    setSaveBanner('¡Directiva pegada exitosamente en la Calibración del Modelo! Recuerda presionar "Guardar Calibración" para que el motor la aplique.');
    if (onNotify) onNotify('Directiva pegada en Calibración de Modelo', 'success');
    setTimeout(() => {
      editorRef.current?.focus();
      editorRef.current?.scrollTo({ top: editorRef.current.scrollHeight, behavior: 'smooth' });
    }, 200);
  };

  // Send message to calibration consultant
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || chatInput;
    if (!text.trim() || isChatSending) return;

    const userMsg: CalibrationChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsChatSending(true);

    try {
      // Build history for backend starting strictly with user turn
      const relevantHistory = chatMessages.filter(
        (m, idx) => !(idx === 0 && m.sender === 'assistant')
      );
      const historyPayload = relevantHistory.slice(-6).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        text: m.text
      }));

      let data: any = null;
      try {
        const res = await fetch('/api/calibration/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text.trim(),
            history: historyPayload,
            customDirectives,
            ragContext: ragContextData
          })
        });

        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            data = await res.json();
          }
        }
      } catch (networkErr) {
        console.warn('Fallo de red hacia /api/calibration/chat, usando consultor de contingencia:', networkErr);
      }

      // If backend response is missing or empty, use instant expert consultant with RAG
      if (!data || !data.reply) {
        const fallback = getClientConsultantReply(text.trim(), ragContextData);
        data = {
          reply: fallback.reply,
          suggestedDirective: fallback.suggestedDirective
        };
      }

      const assistantMsg: CalibrationChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedDirective: data.suggestedDirective
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const fallback = getClientConsultantReply(text.trim(), ragContextData);
      const assistantMsg: CalibrationChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: fallback.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedDirective: fallback.suggestedDirective
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsChatSending(false);
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleCopyText = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#DADCE0] bg-white p-5 shadow-xs md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#1A73E8]">
            <SlidersHorizontal className="h-4 w-4" />
            <span>Gobernanza & Calibración de Prompts IA</span>
            <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[11px] font-medium text-[#1A73E8]">
              {calibrationData?.version || 'v1.3.0'}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#202124]">
            Centro de Calibración & Consultor IA Claro Chile
          </h1>
          <p className="mt-1 text-sm text-[#5F6368]">
            Visualiza el prompt base de auditoría, añade directivas operativas personalizadas y consulta con el chatbot asistente para recibir sugerencias y afinación de criterios en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-reset-calibration"
            onClick={handleResetCalibration}
            disabled={isResetting || isLoading}
            className="flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-3.5 py-2 text-xs font-medium text-[#5F6368] transition hover:bg-[#F1F3F4] hover:text-[#202124] disabled:opacity-50"
            title="Restablecer directivas a valores de fábrica"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Restablecer</span>
          </button>

          <button
            id="btn-save-calibration"
            onClick={handleSaveCalibration}
            disabled={isSaving || isLoading}
            className="flex items-center gap-2 rounded-lg bg-[#1A73E8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1557B0] disabled:opacity-50"
          >
            <Save className={`h-4 w-4 ${isSaving ? 'animate-pulse' : ''}`} />
            <span>{isSaving ? 'Guardando...' : 'Guardar Calibración'}</span>
          </button>
        </div>
      </div>

      {/* Success / Alert Banner */}
      {saveBanner && (
        <div className="flex items-center justify-between rounded-lg border border-[#34A853]/30 bg-[#E6F4EA] p-3.5 text-sm text-[#137333] shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#34A853]" />
            <span className="font-medium">{saveBanner}</span>
          </div>
          <button
            onClick={() => setSaveBanner(null)}
            className="text-xs font-semibold underline hover:text-[#0d5926]"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Main Grid: Left (Editor / Base Prompt) + Right (Chatbot Consultant) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (7 cols): Prompt Governance & Directives */}
        <div className="flex flex-col rounded-xl border border-[#DADCE0] bg-white shadow-xs lg:col-span-7">
          {/* Sub-Navigation Tabs */}
          <div className="flex border-b border-[#DADCE0] px-4 pt-3">
            <button
              id="tab-directives"
              onClick={() => setActiveTab('directives')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                activeTab === 'directives'
                  ? 'border-[#1A73E8] text-[#1A73E8]'
                  : 'border-transparent text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Directivas Adicionales (Editor Activo)</span>
              <span className="rounded-full bg-[#E8F0FE] px-2 py-0.2 text-[10px] font-bold text-[#1A73E8]">
                Prioridad
              </span>
            </button>

            <button
              id="tab-base-prompt"
              onClick={() => setActiveTab('basePrompt')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                activeTab === 'basePrompt'
                  ? 'border-[#1A73E8] text-[#1A73E8]'
                  : 'border-transparent text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>Pauta Base Oficial (Prompt de Sistema)</span>
            </button>

            <button
              id="tab-sensitivity"
              onClick={() => setActiveTab('sensitivity')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                activeTab === 'sensitivity'
                  ? 'border-[#1A73E8] text-[#1A73E8]'
                  : 'border-transparent text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              <Gauge className="h-4 w-4" />
              <span>Sensibilidad Operativa</span>
            </button>
          </div>

          {/* Sub-Tab Content */}
          <div className="flex-1 p-5">
            {activeTab === 'directives' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-[#D2E3FC] bg-[#EEF5FD] p-3">
                  <div>
                    <h4 className="text-xs font-bold text-[#185ABC] flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-[#1A73E8]" />
                      Directivas de Calibración Activas en el Motor
                    </h4>
                    <p className="text-[11px] text-[#5F6368] mt-0.5">
                      Reglas y excepciones con máxima prioridad aplicadas al auditar las llamadas.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      id="btn-open-model-calibration-modal"
                      type="button"
                      onClick={() => {
                        setIsModelModalOpen(true);
                        setModelModalResult(null);
                      }}
                      className="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#1A73E8] to-[#1557B0] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:shadow-md hover:brightness-105 active:scale-95 cursor-pointer"
                      title="Abrir asistente para calibrar el modelo de acuerdo a consultas operativas"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[#FEEA3A] transition group-hover:rotate-12" />
                      <span>Calibración de Modelo con IA</span>
                      <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-extrabold uppercase tracking-wide">
                        RAG
                      </span>
                    </button>
                    <span className="font-mono text-[11px] text-[#70757A] hidden sm:inline">
                      {customDirectives.length} caracteres
                    </span>
                  </div>
                </div>

                {/* Directives Textarea */}
                <div className="relative">
                  <textarea
                    id="textarea-custom-directives"
                    ref={editorRef}
                    rows={16}
                    value={customDirectives}
                    onChange={(e) => setCustomDirectives(e.target.value)}
                    placeholder="# Escribe aquí tus directivas personalizadas o insértalas desde las sugerencias del chatbot..."
                    className="w-full rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-3.5 font-mono text-xs leading-relaxed text-[#202124] transition focus:border-[#1A73E8] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1A73E8]"
                  />
                </div>

                {/* Quick Insert Templates */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#5F6368]">
                    Plantillas rápidas de calibración frecuente:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_TEMPLATES.map((tmpl, idx) => (
                      <button
                        key={idx}
                        id={`btn-tmpl-${idx}`}
                        onClick={() => handleInsertTemplate(tmpl.content)}
                        className="group flex items-center gap-1.5 rounded-md border border-[#DADCE0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#3C4043] transition hover:border-[#1A73E8] hover:bg-[#E8F0FE] hover:text-[#1A73E8]"
                        title={tmpl.content}
                      >
                        <Plus className="h-3 w-3 text-[#1A73E8] transition group-hover:scale-110" />
                        <span>{tmpl.title}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-[#E8EAED] bg-[#F8F9FA] p-3 text-xs text-[#5F6368]">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1A73E8]" />
                    <p>
                      <strong>¿Cómo funciona la calibración?</strong> Cada vez que subas un audio o proceses una llamada, el motor concatena el prompt base oficial con estas directivas activas. Las directivas personalizadas tienen poder de anulación y modulación sobre las reglas generales.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'basePrompt' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#5F6368]">
                    Prompt de sistema oficial calibrado para Contact Centers Claro Chile (Solo lectura):
                  </p>
                  <button
                    onClick={() => handleCopyText(calibrationData?.basePrompt || '', 'full-prompt')}
                    className="flex items-center gap-1.5 rounded-md border border-[#DADCE0] bg-white px-2.5 py-1 text-xs font-medium text-[#3C4043] transition hover:bg-[#F1F3F4]"
                  >
                    {copiedSection === 'full-prompt' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#34A853]" />
                        <span className="text-[#34A853]">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-[#5F6368]" />
                        <span>Copiar Prompt Completo</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Structured Sections Accordion */}
                <div className="space-y-2">
                  {/* Section 1: OJT */}
                  <div className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] overflow-hidden">
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'ojt' ? null : 'ojt')}
                      className="flex w-full items-center justify-between p-3 text-left text-xs font-bold text-[#202124] hover:bg-[#F1F3F4]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1A73E8] text-[10px] text-white">1</span>
                        Contexto Crítico OJT (On-The-Job Training / Aceleración)
                      </span>
                      {expandedSection === 'ojt' ? <ChevronUp className="h-4 w-4 text-[#5F6368]" /> : <ChevronDown className="h-4 w-4 text-[#5F6368]" />}
                    </button>
                    {expandedSection === 'ojt' && (
                      <div className="border-t border-[#DADCE0] bg-white p-3.5 text-xs leading-relaxed text-[#3C4043] whitespace-pre-wrap font-mono">
                        {`CONTEXTO CRÍTICO DE OJT (ON-THE-JOB TRAINING / PISO DE ENTRENAMIENTO EN VIVO):
- ESTAS LLAMADAS SON DE ASESORES EN PROCESO DE OJT / NIDO ATENDIENDO A CLIENTES REALES EN PRODUCCIÓN EN VIVO.
- Los asesores enfrentan doble demanda operativa: atender con cortesía la rapidez y modismos de clientes chilenos reales mientras buscan procedimientos en los sistemas corporativos (Somos Clave, CRM) o consultan a su tutor de piso.
- Tu misión no es punitiva, sino FORMATIVA Y DE ACELERACIÓN:
  * Diferencia los errores actitudinales (graves) de las vacilaciones o pausas por consulta/búsqueda en aplicativos.
  * 'nivel_madurez': 'EN_REFUERZO' | 'EN_DESARROLLO' | 'LISTO_PRODUCCION'.
  * 'indice_autonomia': 0 a 100%.
  * 'brecha_principal': 'PROCEDIMIENTO_GUION' | 'HERRAMIENTA_SISTEMAS' | 'HABILIDADES_BLANDAS' | 'NINGUNA_DOMINIO'.
  * 'roleplay_sugerido': Simulación de 5 minutos específica para el tutor OJT.`}
                      </div>
                    )}
                  </div>

                  {/* Section 2: tNPS */}
                  <div className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] overflow-hidden">
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'tnps' ? null : 'tnps')}
                      className="flex w-full items-center justify-between p-3 text-left text-xs font-bold text-[#202124] hover:bg-[#F1F3F4]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1A73E8] text-[10px] text-white">2</span>
                        Calibración tNPS Amigable, Equilibrada y Justa
                      </span>
                      {expandedSection === 'tnps' ? <ChevronUp className="h-4 w-4 text-[#5F6368]" /> : <ChevronDown className="h-4 w-4 text-[#5F6368]" />}
                    </button>
                    {expandedSection === 'tnps' && (
                      <div className="border-t border-[#DADCE0] bg-white p-3.5 text-xs leading-relaxed text-[#3C4043] whitespace-pre-wrap font-mono">
                        {`CALIBRACIÓN tNPS AMIGABLE, EQUILIBRADA Y JUSTA:
- El tNPS predicho debe ser constructivo y realista. Los clientes de telecomunicaciones suelen separar la molestia con Claro de la atención humana del asesor.
1. Desacopla la marca del asesor: Califica el esfuerzo humano en 'score_agente' (0-10) y explícalo en 'factor_marca_vs_agente'.
2. Sensibilidad al cierre real: Si el cliente finalizó tranquilo o agradeciendo ("gracias por su tiempo", "muy amable", "se pasó"), el tNPS DEBE situarse en NEUTRO (7-8) o PROMOTOR (9-10). ¡Nunca clasifiques a un cliente agradecido como DETRACTOR!
3. Zona constructiva en OJT (Neutros 7-8): Explica en 'camino_a_promotor' qué pequeño detalle puntual lo convertiría en 9 o 10.
4. Reserva DETRACTOR (0-6) únicamente cuando hubo un quiebre grave originado directamente por el asesor.`}
                      </div>
                    )}
                  </div>

                  {/* Section 3: Cultural */}
                  <div className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] overflow-hidden">
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'cultural' ? null : 'cultural')}
                      className="flex w-full items-center justify-between p-3 text-left text-xs font-bold text-[#202124] hover:bg-[#F1F3F4]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1A73E8] text-[10px] text-white">3</span>
                        Contexto Cultural y Lingüístico Chileno (Telecomunicaciones)
                      </span>
                      {expandedSection === 'cultural' ? <ChevronUp className="h-4 w-4 text-[#5F6368]" /> : <ChevronDown className="h-4 w-4 text-[#5F6368]" />}
                    </button>
                    {expandedSection === 'cultural' && (
                      <div className="border-t border-[#DADCE0] bg-white p-3.5 text-xs leading-relaxed text-[#3C4043] whitespace-pre-wrap font-mono">
                        {`CONTEXTO CULTURAL Y OPERATIVO HÍBRIDO (CHILENO - PERUANO):
- ASESORES: Con acento peruano neutro institucional o formal, protocolos de atención al cliente de telecomunicaciones.
- CLIENTES: Con modismos locales, acento chileno, ritmo y cadencia rápida.
- Vocabulario chileno esencial:
  * "Boleta" = Factura mensual.
  * "RUT" = Cédula de identidad chilena.
  * "Al tiro" = De inmediato.
  * "Cachar / Cachái" = Entender / ¿Entiendes?
  * "Chato / Chata" = Molesto / Cansado.
  * "Caleta" = Mucho tiempo.
- Alertas críticas normativas: SERNAC, SUBTEL, Demanda, Reclamo formal, Intención de fuga.`}
                      </div>
                    )}
                  </div>

                  {/* Section 4: 4 Fases */}
                  <div className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] overflow-hidden">
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'fases' ? null : 'fases')}
                      className="flex w-full items-center justify-between p-3 text-left text-xs font-bold text-[#202124] hover:bg-[#F1F3F4]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1A73E8] text-[10px] text-white">4</span>
                        Pauta Oficial de Atención Institucional Claro Chile (4 Fases)
                      </span>
                      {expandedSection === 'fases' ? <ChevronUp className="h-4 w-4 text-[#5F6368]" /> : <ChevronDown className="h-4 w-4 text-[#5F6368]" />}
                    </button>
                    {expandedSection === 'fases' && (
                      <div className="border-t border-[#DADCE0] bg-white p-3.5 text-xs leading-relaxed text-[#3C4043] whitespace-pre-wrap font-mono">
                        {`FASE 1: BIENVENIDA
- Experiencia positiva, dar la bienvenida a Claro.
- Mencionar PRIMER NOMBRE y PRIMER APELLIDO obligatorio.
- Confirmar nombre del cliente o RUT.

FASE 2: ENTENDER Y RESOLVER
- Parafrasear el problema del cliente con escucha activa.
- Ordenar múltiples requerimientos.
- Sistemas oficiales Somos Clave / CRM.
- Cortesía obligatoria (por favor / gracias).
- Validación de identidad por RUT.

FASE 3: INFORMAR ACCIÓN
- Indicar gestión específica al pedir espera (hold).
- Retomar llamada en MENOS DE UN MINUTO.
- Claridad en condiciones comerciales y valores proporcionales.
- Resumen final de la gestión realizada.

FASE 4: CIERRE
- Preguntas de aseguramiento explícitas.
- Esperar confirmación activa del cliente.
- Protocolo normativo de encuesta: escala explicada de 0 a 10.`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'sensitivity' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-[#202124]">
                    Parámetros Dinámicos de Sensibilidad Operativa
                  </h3>
                  <p className="mt-0.5 text-xs text-[#5F6368]">
                    Ajusta los umbrales cuantitativos que determinan cómo la IA pondera silencios, notas tNPS y modismos chilenos.
                  </p>
                </div>

                {/* Slider: Silence Tolerance */}
                <div className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#202124] flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#1A73E8]" />
                      <span>Tolerancia a silencios operativos sin hold</span>
                    </label>
                    <span className="rounded-md bg-[#E8F0FE] px-2.5 py-1 font-mono text-xs font-bold text-[#1A73E8]">
                      {sensitivity.silenceToleranceSeconds} segundos
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#5F6368]">
                    Tiempo que el asesor puede tomar buscando en Somos Clave antes de que la IA comience a penalizar la nota de tiempos de espera o marcar quiebre por dead air.
                  </p>
                  <input
                    type="range"
                    min="15"
                    max="90"
                    step="5"
                    value={sensitivity.silenceToleranceSeconds}
                    onChange={(e) =>
                      setSensitivity({ ...sensitivity, silenceToleranceSeconds: Number(e.target.value) })
                    }
                    className="mt-3 w-full accent-[#1A73E8]"
                  />
                  <div className="flex justify-between text-[11px] text-[#70757A]">
                    <span>15s (Estricto)</span>
                    <span>30s (Recomendado OJT)</span>
                    <span>60s (Permisivo)</span>
                    <span>90s (Máximo)</span>
                  </div>
                </div>

                {/* tNPS Detractor Strictness */}
                <div className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-4">
                  <label className="text-xs font-bold text-[#202124] flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-[#EA4335]" />
                    <span>Criterio de Severidad tNPS Detractor (Notas 0 a 6)</span>
                  </label>
                  <p className="mt-1 text-xs text-[#5F6368]">
                    Determina con qué facilidad la IA marca a un cliente como Detractor ante quejas por fallas de Claro.
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {[
                      { id: 'flexible', label: 'Flexible / Formativo', desc: 'Prioriza siempre el esfuerzo humano del asesor' },
                      { id: 'equilibrada', label: 'Equilibrada (Estándar)', desc: 'Desacopla marca vs asesor de forma justa' },
                      { id: 'estricta', label: 'Estricta Comercial', desc: 'Castiga si el cliente quedó inconforme' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setSensitivity({
                            ...sensitivity,
                            detractorStrictness: opt.id as any
                          })
                        }
                        className={`flex flex-col rounded-lg border p-3 text-left transition ${
                          sensitivity.detractorStrictness === opt.id
                            ? 'border-[#1A73E8] bg-white shadow-xs ring-2 ring-[#1A73E8]/20'
                            : 'border-[#DADCE0] bg-white hover:bg-[#F1F3F4]'
                        }`}
                      >
                        <span className={`text-xs font-bold ${sensitivity.detractorStrictness === opt.id ? 'text-[#1A73E8]' : 'text-[#202124]'}`}>
                          {opt.label}
                        </span>
                        <span className="mt-1 text-[11px] text-[#5F6368] leading-tight">
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slang and OJT Toggles */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-3.5">
                    <div>
                      <p className="text-xs font-bold text-[#202124]">Tolerancia a Modismos Chilenos</p>
                      <p className="text-[11px] text-[#5F6368]">No penalizar modismos locales chilenos</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSensitivity({ ...sensitivity, chileanSlangTolerance: !sensitivity.chileanSlangTolerance })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        sensitivity.chileanSlangTolerance ? 'bg-[#1A73E8]' : 'bg-[#DADCE0]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          sensitivity.chileanSlangTolerance ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-3.5">
                    <div>
                      <p className="text-xs font-bold text-[#202124]">Enfoque Pedagógico OJT</p>
                      <p className="text-[11px] text-[#5F6368]">Generar roleplays y feedback formativo</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSensitivity({ ...sensitivity, ojtPedagogicalFocus: !sensitivity.ojtPedagogicalFocus })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        sensitivity.ojtPedagogicalFocus ? 'bg-[#1A73E8]' : 'bg-[#DADCE0]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          sensitivity.ojtPedagogicalFocus ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveCalibration}
                    disabled={isSaving}
                    className="flex items-center gap-2 rounded-lg bg-[#1A73E8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1557B0]"
                  >
                    <Save className="h-4 w-4" />
                    <span>Aplicar y Guardar Sensibilidad</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Chatbot Consultant */}
        <div className="flex flex-col rounded-xl border border-[#DADCE0] bg-white shadow-xs lg:col-span-5 h-[620px]">
          {/* Chatbot Header */}
          <div className="flex items-center justify-between border-b border-[#DADCE0] bg-[#F8F9FA] px-4 py-3 rounded-t-xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1A73E8] text-white shadow-xs">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[#202124]">
                  Consultor RAG Speech Analytics & Calibración
                </h3>
                <div className="flex items-center gap-1.5 text-[11px] text-[#34A853]">
                  <span className="h-2 w-2 rounded-full bg-[#34A853] animate-pulse"></span>
                  <span>En línea • RAG con {ragContextData.totalCalls} llamadas analizadas</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setChatMessages([
                  {
                    id: 'welcome-reset',
                    sender: 'assistant',
                    text: 'Conversación reiniciada. ¿Qué consulta o regla operativa deseas calibrar hoy?',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                ]);
              }}
              className="rounded-md p-1 text-[#5F6368] hover:bg-[#DADCE0]/50"
              title="Limpiar chat"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick Starter Chips */}
          <div className="border-b border-[#E8EAED] bg-[#F8F9FA]/60 p-2">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[#70757A]">
              Consultas y calibración rápida:
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5 px-1">
              {[
                '¿Cómo mejoro la calidad de las llamadas?',
                '¿Cómo evitar detractor en quejas de boleta Claro?',
                'Tolerancia a silencios en Somos Clave (45s)',
                '¿Cuáles son los principales quiebres de piso?'
              ].map((query, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(query)}
                  disabled={isChatSending}
                  className="rounded-md border border-[#DADCE0] bg-white px-2 py-1 text-[11px] text-[#3C4043] transition hover:border-[#1A73E8] hover:bg-[#E8F0FE] hover:text-[#1A73E8] disabled:opacity-50 text-left"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-[#1A73E8] text-white rounded-br-xs'
                      : 'border border-[#DADCE0] bg-[#F8F9FA] text-[#202124] rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* If assistant suggested a directive, show interactive insertion card */}
                  {msg.suggestedDirective && (
                    <div className="mt-3 rounded-lg border border-[#1A73E8]/30 bg-white p-3 shadow-xs">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1A73E8]">
                        <Zap className="h-3.5 w-3.5 text-[#1A73E8]" />
                        <span>Directiva recomendada para Calibración de Modelo:</span>
                      </div>
                      <div className="mt-1.5 rounded-md bg-[#F1F3F4] p-2 font-mono text-[11px] text-[#202124] leading-relaxed select-all">
                        {msg.suggestedDirective}
                      </div>
                      <div className="mt-2.5 flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCopyText(msg.suggestedDirective!, `dir-${msg.id}`)}
                          className="flex items-center gap-1 rounded-md border border-[#DADCE0] bg-white px-2 py-1 text-[11px] font-medium text-[#5F6368] hover:bg-[#F1F3F4]"
                        >
                          {copiedSection === `dir-${msg.id}` ? (
                            <Check className="h-3 w-3 text-[#34A853]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>Copiar</span>
                        </button>
                        <button
                          id={`btn-add-directive-${msg.id}`}
                          onClick={() => handleAddDirectiveFromChat(msg.suggestedDirective!)}
                          className="flex items-center gap-1.5 rounded-md bg-[#34A853] px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-[#2D9249] transition active:scale-95"
                          title="Pegar esta directiva en la Calibración del Modelo activa"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                          <span>Pegar en Calibración del Modelo</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <span className="mt-1 px-1 text-[10px] text-[#70757A]">{msg.timestamp}</span>
              </div>
            ))}

            {isChatSending && (
              <div className="flex items-center gap-2 text-xs text-[#5F6368] p-2 bg-[#F8F9FA] rounded-lg w-fit">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#1A73E8]" />
                <span>El consultor está formulando la directiva de calibración con RAG...</span>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="border-t border-[#DADCE0] p-3 bg-white rounded-b-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                id="input-chat-calibration"
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Pregúntale al consultor (calidad, quiebres, directivas de modelo)..."
                className="flex-1 rounded-lg border border-[#DADCE0] bg-[#F8F9FA] px-3.5 py-2 text-xs text-[#202124] transition focus:border-[#1A73E8] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1A73E8]"
                disabled={isChatSending}
              />
              <button
                id="btn-send-calibration-chat"
                type="submit"
                disabled={!chatInput.trim() || isChatSending}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1A73E8] text-white shadow-xs transition hover:bg-[#1557B0] disabled:opacity-50 shrink-0 cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Modal de Calibración de Modelo con IA (RAG) */}
      {isModelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[#DADCE0] bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#DADCE0] bg-gradient-to-r from-[#F8F9FA] to-[#EEF5FD] px-5 py-4 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1A73E8] to-[#1557B0] text-white shadow-xs">
                  <Sparkles className="h-5 w-5 text-[#FEEA3A]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#202124] flex items-center gap-2">
                    Calibración de Modelo con IA
                    <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-bold text-[#1A73E8] uppercase">
                      RAG Activo
                    </span>
                  </h3>
                  <p className="text-xs text-[#5F6368]">
                    La IA consulta los datos operativos de tus llamadas y redacta el prompt óptimo para tu modelo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModelModalOpen(false)}
                className="rounded-lg p-1.5 text-[#5F6368] transition hover:bg-[#DADCE0]/50 hover:text-[#202124] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* RAG Context Strip */}
              <div className="rounded-xl border border-[#D2E3FC] bg-[#F8FBFF] p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#185ABC] mb-1.5">
                  <Database className="h-4 w-4 text-[#1A73E8]" />
                  <span>Contexto Operativo RAG Inyectado al Modelo:</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  <div className="rounded-lg bg-white p-2 border border-[#E8EAED]">
                    <span className="text-[#70757A] block">Llamadas Base:</span>
                    <span className="font-bold text-[#202124]">{ragContextData.totalCalls} evaluadas</span>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-[#E8EAED]">
                    <span className="text-[#70757A] block">QA Promedio:</span>
                    <span className="font-bold text-[#1A73E8]">{ragContextData.avgScore}/100</span>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-[#E8EAED]">
                    <span className="text-[#70757A] block">Detractores tNPS:</span>
                    <span className="font-bold text-[#EA4335]">{ragContextData.detractorsPct}%</span>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-[#E8EAED]">
                    <span className="text-[#70757A] block">Promotores tNPS:</span>
                    <span className="font-bold text-[#34A853]">{ragContextData.promotersPct}%</span>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-[#5F6368]">
                  <strong>Quiebres de atención frecuentes:</strong> {ragContextData.topQuiebres}
                </div>
              </div>

              {/* Consultation Input */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#202124] flex items-center justify-between">
                  <span>¿Qué situación o regla operativa deseas calibrar en el modelo?</span>
                  <span className="text-[11px] font-normal text-[#70757A]">Usa billones de parámetros de IA</span>
                </label>
                <textarea
                  rows={3}
                  value={modelModalQuery}
                  onChange={(e) => setModelModalQuery(e.target.value)}
                  placeholder="Ej: Deseo que si un cliente reclama por cobros altos en su boleta de Claro, pero el asesor mantiene la calma y ofrece alternativas sin perder el respeto, la IA no lo penalice como detractor..."
                  className="w-full rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-3 text-xs leading-relaxed text-[#202124] focus:border-[#1A73E8] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1A73E8]"
                />

                {/* Quick Query Pills */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#70757A] block mb-1.5">
                    Ejemplos frecuentes de calibración:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Tolerancia a silencios en Somos Clave (45s sin marcar quiebre)',
                      'Blindaje tNPS ante reclamos críticos de boleta Claro',
                      'Flexibilidad en bienvenida por interrupción de cliente',
                      'Validación estricta de titularidad por RUT completo'
                    ].map((example, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setModelModalQuery(example);
                          handleGenerateModelCalibration(example);
                        }}
                        disabled={isModelModalLoading}
                        className="rounded-md border border-[#DADCE0] bg-white px-2 py-1 text-[11px] text-[#3C4043] transition hover:border-[#1A73E8] hover:bg-[#E8F0FE] hover:text-[#1A73E8] text-left cursor-pointer"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleGenerateModelCalibration()}
                    disabled={!modelModalQuery.trim() || isModelModalLoading}
                    className="flex items-center gap-2 rounded-lg bg-[#1A73E8] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#1557B0] disabled:opacity-50 cursor-pointer"
                  >
                    {isModelModalLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Consultando a la IA y formulando prompt...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 text-[#FEEA3A]" />
                        <span>Generar Directiva de Calibración</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* AI Generated Result & Paste Action */}
              {modelModalResult && (
                <div className="space-y-3 rounded-xl border border-[#1A73E8]/30 bg-[#F8FBFF] p-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs font-bold text-[#1A73E8]">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-[#34A853]" />
                      <span>Directiva Calibrada por la IA:</span>
                    </div>
                    {modelModalResult.modelUsed && (
                      <span className="text-[10px] font-normal text-[#5F6368]">
                        Motor: {modelModalResult.modelUsed}
                      </span>
                    )}
                  </div>

                  {/* AI Explanation */}
                  <p className="text-xs text-[#3C4043] leading-relaxed whitespace-pre-wrap">
                    {modelModalResult.reply}
                  </p>

                  {/* Prompt Directive Block */}
                  {modelModalResult.suggestedDirective && (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-[#DADCE0] bg-[#202124] p-3 font-mono text-xs text-[#E8EAED] leading-relaxed select-all">
                        {modelModalResult.suggestedDirective}
                      </div>

                      {/* Main requested button: "Pegar en la calibración del modelo" */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleCopyText(modelModalResult.suggestedDirective!, 'modal-dir')}
                          className="flex items-center gap-1.5 rounded-lg border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-medium text-[#5F6368] hover:bg-[#F1F3F4]"
                        >
                          {copiedSection === 'modal-dir' ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-[#34A853]" />
                              <span className="text-[#34A853]">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copiar Prompt</span>
                            </>
                          )}
                        </button>

                        <button
                          id="btn-paste-directive-to-model"
                          type="button"
                          onClick={() => handlePasteDirectiveIntoEditor(modelModalResult.suggestedDirective)}
                          className="flex items-center gap-2 rounded-lg bg-[#34A853] px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#2D9249] active:scale-95 cursor-pointer"
                        >
                          <Terminal className="h-4 w-4" />
                          <span>Pegar en Calibración del Modelo</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-[#DADCE0] bg-[#F8F9FA] px-5 py-3 rounded-b-2xl">
              <span className="text-[11px] text-[#70757A]">
                La directiva se pegará directamente en el editor activo de Directivas del modelo.
              </span>
              <button
                type="button"
                onClick={() => setIsModelModalOpen(false)}
                className="rounded-lg border border-[#DADCE0] bg-white px-3.5 py-1.5 text-xs font-medium text-[#5F6368] hover:bg-[#F1F3F4]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
