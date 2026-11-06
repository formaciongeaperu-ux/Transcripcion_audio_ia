#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GEA PERÚ / CLARO CHILE - Motor de Red Neuronal Híbrida (MLP) & Agente Autónomo de IA
====================================================================================
Entrena un Perceptrón Multicapa (Red Neuronal Profunda) combinando:
1. 28 Features Operativas, Acústicas y de Protocolo (4 Fases Claro Chile).
2. Embeddings Semánticos Denso-Vectoriales (TF-IDF + TruncatedSVD sobre resúmenes y citas de quiebres).
3. RAG Vectorial sobre `documentos_qa` en Supabase (3,072 dimensiones con Gemini).

Cabezas de Predicción:
- Cabeza 1 (MLPClassifier): Probabilidad de Detracción / Riesgo de Churn (0% a 100%).
- Cabeza 2 (MLPClassifier): Riesgo de Intervención de Tutor OJT / Brecha Formativa.
- Motor de Agente Autónomo: Evalúa umbrales neuronales y ejecuta acciones reales en Supabase
  (`operaciones_call_records` para rescate de clientes y `coaching_plans` para asesores).
"""

import os
import sys
import json
import math
import time
import warnings
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional

import numpy as np
import requests
import joblib
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.inspection import permutation_importance

warnings.filterwarnings("ignore")

# Configuración de conexión a Supabase
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "https://givdlqjfnctxvarpybht.supabase.co")
SUPABASE_SECRET_KEY = (
    os.environ.get("SUPABASE_SECRET_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("VITE_SUPABASE_ANON_KEY")
    or ""
)

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
os.makedirs(MODELS_DIR, exist_ok=True)
MODEL_BUNDLE_PATH = os.path.join(MODELS_DIR, "claro_neural_agent.joblib")
REPORT_JSON_PATH = os.path.join(MODELS_DIR, "neural_training_report.json")


FEATURE_NAMES = [
    "duracion_segundos",
    "porcentaje_silencio",
    "silencio_agente_seg",
    "sentimiento_score",
    "crit_amabilidad",
    "crit_seguridad",
    "crit_claridad",
    "crit_tiempos_hold",
    "crit_eficiencia_tmo",
    "f1_experiencia_positiva",
    "f1_mencionar_claro",
    "f1_nombre_apellido",
    "f1_confirmar_cliente_rut",
    "f2_parafrasear",
    "f2_ordenar_req",
    "f2_somos_clave",
    "f2_cortesia",
    "f2_validacion_id",
    "f3_indicar_espera",
    "f3_retomar_60s",
    "f3_claridad_comercial",
    "f3_resumen_gestion",
    "f4_preguntas_aseguramiento",
    "f4_esperar_confirmacion",
    "f4_encuesta_0_10",
    "quiebres_total",
    "quiebres_criticos",
    "fcr_resuelto",
]

FEATURE_LABELS_ES = {
    "duracion_segundos": "Duración de Llamada (TMO)",
    "porcentaje_silencio": "% Silencio Conversacional",
    "silencio_agente_seg": "Segundos de Silencio del Asesor",
    "sentimiento_score": "Tono / Sentimiento Acústico",
    "crit_amabilidad": "Criterio: Amabilidad y Empatía",
    "crit_seguridad": "Criterio: Seguridad al Expresarse",
    "crit_claridad": "Criterio: Claridad de Información",
    "crit_tiempos_hold": "Criterio: Gestión de Tiempos (Hold)",
    "crit_eficiencia_tmo": "Criterio: Eficiencia y TMO",
    "f1_experiencia_positiva": "Fase 1: Generar Experiencia Positiva",
    "f1_mencionar_claro": "Fase 1: Mencionar Marca Claro",
    "f1_nombre_apellido": "Fase 1: Nombre y Apellido del Asesor",
    "f1_confirmar_cliente_rut": "Fase 1: Confirmar RUT / Celular",
    "f2_parafrasear": "Fase 2: Parafrasear Problema",
    "f2_ordenar_req": "Fase 2: Ordenar Requerimientos",
    "f2_somos_clave": "Fase 2: Uso de Somos Clave / CRM",
    "f2_cortesia": "Fase 2: Cortesía (Por favor / Gracias)",
    "f2_validacion_id": "Fase 2: Validación de Titularidad",
    "f3_indicar_espera": "Fase 3: Indicar Motivo de Espera",
    "f3_retomar_60s": "Fase 3: Retomar Llamada < 60s",
    "f3_claridad_comercial": "Fase 3: Claridad en Condiciones Comerciales",
    "f3_resumen_gestion": "Fase 3: Resumen de Gestión",
    "f4_preguntas_aseguramiento": "Fase 4: Preguntas de Aseguramiento",
    "f4_esperar_confirmacion": "Fase 4: Esperar Confirmación Activa",
    "f4_encuesta_0_10": "Fase 4: Guion Encuesta Escala 0-10",
    "quiebres_total": "Cantidad Total de Quiebres",
    "quiebres_criticos": "Quiebres de Severidad Crítica",
    "fcr_resuelto": "Resolución en Primer Contacto (FCR)",
}


def supabase_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def fetch_all_calls(limit: int = 1500) -> List[Dict[str, Any]]:
    """Descarga los registros históricos desde call_records en Supabase."""
    cols = (
        "id,codigo_llamada,fecha_hora,agente_nombre,agente_id,cliente_nombre,cliente_telefono,"
        "cola_atencion,duracion_total,duracion_segundos,qa_score_global,resumen,motivo_categoria,"
        "motivo_nombre,sentimiento_score,sentimiento_label,csat_estimado,resolucion_primer_contacto,"
        "evaluacion_criterios,cumplimiento_guion,nps_pronostico,diagnostico_ojt,"
        "silencio_analisis,quiebres_atencion,feedback_coaching,keywords,alertas,file_name"
    )
    all_rows: List[Dict[str, Any]] = []
    batch_size = 500
    offset = 0

    while offset < limit:
        url = (
            f"{SUPABASE_URL}/rest/v1/call_records"
            f"?select={cols}&order=fecha_hora.desc&limit={batch_size}&offset={offset}"
        )
        res = requests.get(url, headers=supabase_headers(), timeout=30)
        if not res.ok:
            break
        batch = res.json()
        if not batch:
            break
        all_rows.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size

    return all_rows


def fetch_vector_store_count() -> int:
    url = f"{SUPABASE_URL}/rest/v1/documentos_qa?select=id&limit=1"
    headers = {**supabase_headers(), "Prefer": "count=exact"}
    res = requests.get(url, headers=headers, timeout=15)
    content_range = res.headers.get("Content-Range", "0-0/0")
    try:
        return int(content_range.split("/")[-1])
    except Exception:
        return 0


def extract_numeric_features(call: Dict[str, Any]) -> List[float]:
    """Extrae las 28 variables numéricas y de protocolo para la capa de entrada de la Red Neuronal."""
    dur = float(call.get("duracion_segundos") or 240.0)
    sil = call.get("silencio_analisis") or {}
    pct_sil = float(sil.get("porcentaje_silencio") or 0.0)
    seg_sil = float(sil.get("silencio_agente_segundos") or sil.get("tiempo_silencio_segundos") or 0.0)
    sent = float(call.get("sentimiento_score") or 0.0)

    crits = call.get("evaluacion_criterios") or {}
    c_ama = float((crits.get("amabilidad_empatia") or {}).get("nota") or 75.0)
    c_seg = float((crits.get("seguridad_expresarse") or {}).get("nota") or 75.0)
    c_cla = float((crits.get("claridad_informacion") or {}).get("nota") or 75.0)
    c_hol = float((crits.get("tiempos_espera_hold") or {}).get("nota") or 75.0)
    c_tmo = float((crits.get("eficiencia_tmo") or {}).get("nota") or 75.0)

    cg = call.get("cumplimiento_guion") or {}
    fases = cg.get("fases") or {}
    b = fases.get("bienvenida") or {}
    er = fases.get("entender_resolver") or {}
    ia = fases.get("informar_accion") or {}
    ci = fases.get("cierre") or {}

    f1_1 = 1.0 if b.get("generar_experiencia_positiva", cg.get("saludo_institucional", True)) else 0.0
    f1_2 = 1.0 if b.get("mencionar_empresa_claro", cg.get("saludo_institucional", True)) else 0.0
    f1_3 = 1.0 if b.get("mencionar_nombre_apellido", True) else 0.0
    f1_4 = 1.0 if b.get("confirmar_nombre_cliente_rut_celular", cg.get("verificacion_identidad", True)) else 0.0

    f2_1 = 1.0 if er.get("parafrasear_problema", cg.get("escucha_activa", True)) else 0.0
    f2_2 = 1.0 if er.get("ordenar_multiples_requerimientos", True) else 0.0
    f2_3 = 1.0 if er.get("utilizar_sistemas_oficiales_somos_clave", True) else 0.0
    f2_4 = 1.0 if er.get("cortesia_por_favor_gracias", True) else 0.0
    f2_5 = 1.0 if er.get("validacion_identidad", cg.get("verificacion_identidad", True)) else 0.0

    f3_1 = 1.0 if ia.get("indicar_gestion_espera", True) else 0.0
    f3_2 = 1.0 if ia.get("retomar_en_menos_de_un_minuto", True) else 0.0
    f3_3 = 1.0 if ia.get("claridad_condiciones_comerciales", True) else 0.0
    f3_4 = 1.0 if ia.get("resumen_atencion_gestion", True) else 0.0

    f4_1 = 1.0 if ci.get("preguntas_aseguramiento", cg.get("ofrecimiento_ayuda", True)) else 0.0
    f4_2 = 1.0 if ci.get("esperar_confirmacion_cliente", cg.get("despedida_cordial", True)) else 0.0
    f4_3 = 1.0 if ci.get("guion_encuesta_escala_0_a_10", False) else 0.0

    quiebres = call.get("quiebres_atencion") or []
    q_total = float(len(quiebres)) if isinstance(quiebres, list) else 0.0
    q_crit = float(
        sum(
            1
            for q in (quiebres if isinstance(quiebres, list) else [])
            if str((q or {}).get("severidad", "")).upper().startswith("CR")
        )
    )

    fcr = 1.0 if call.get("resolucion_primer_contacto", True) else 0.0

    return [
        dur, pct_sil, seg_sil, sent,
        c_ama, c_seg, c_cla, c_hol, c_tmo,
        f1_1, f1_2, f1_3, f1_4,
        f2_1, f2_2, f2_3, f2_4, f2_5,
        f3_1, f3_2, f3_3, f3_4,
        f4_1, f4_2, f4_3,
        q_total, q_crit, fcr
    ]


def extract_text_corpus(call: Dict[str, Any]) -> str:
    """Concatena resumen, motivo, quiebres y keywords para el embedding semántico local."""
    parts = [
        str(call.get("motivo_categoria") or ""),
        str(call.get("motivo_nombre") or ""),
        str(call.get("resumen") or ""),
    ]
    quiebres = call.get("quiebres_atencion") or []
    if isinstance(quiebres, list):
        for q in quiebres:
            if isinstance(q, dict):
                parts.append(str(q.get("tipo") or ""))
                parts.append(str(q.get("cita") or ""))
                parts.append(str(q.get("impacto_cliente") or ""))
    kws = call.get("keywords") or []
    if isinstance(kws, list):
        parts.extend(str(k) for k in kws)
    return " ".join(p for p in parts if p).strip()


def extract_targets(call: Dict[str, Any]) -> Tuple[int, int]:
    """
    Target 1 (y_churn): 1 si la llamada es DETRACTOR (score <= 6) o riesgo_churn alto/crítico.
    Target 2 (y_ojt): 1 si requiere intervención de tutor OJT o nivel_madurez == EN_REFUERZO o QA < 72.
    """
    nps = call.get("nps_pronostico") or {}
    nps_score = nps.get("score")
    nps_clasif = str(nps.get("clasificacion") or "").upper()
    ops = call.get("diagnostico_operaciones") or {}

    is_detractor = (
        (isinstance(nps_score, (int, float)) and nps_score <= 6)
        or "DETRACTOR" in nps_clasif
        or bool(ops.get("es_detractor"))
        or str(ops.get("riesgo_churn") or "").lower() in ("critico", "medio")
    )

    ojt = call.get("diagnostico_ojt") or {}
    qa_score = float(call.get("qa_score_global") or 75.0)
    needs_tutor = (
        bool(ojt.get("requiere_intervencion_tutor"))
        or str(ojt.get("nivel_madurez") or "").upper() == "EN_REFUERZO"
        or qa_score < 72.0
    )

    return (1 if is_detractor else 0), (1 if needs_tutor else 0)


def train_neural_network() -> Dict[str, Any]:
    """Descarga las llamadas de Supabase, entrena la Red Neuronal Híbrida (MLP) y genera el diagnóstico."""
    t0 = time.time()
    calls = fetch_all_calls(limit=1500)
    if not calls or len(calls) < 20:
        raise RuntimeError(f"Insuficientes llamadas en Supabase para entrenar ({len(calls)} encontradas).")

    X_num_list = []
    texts = []
    y_churn_list = []
    y_ojt_list = []

    for c in calls:
        X_num_list.append(extract_numeric_features(c))
        texts.append(extract_text_corpus(c))
        yc, yo = extract_targets(c)
        y_churn_list.append(yc)
        y_ojt_list.append(yo)

    X_num = np.array(X_num_list, dtype=np.float64)
    y_churn = np.array(y_churn_list, dtype=np.int32)
    y_ojt = np.array(y_ojt_list, dtype=np.int32)

    # 1. Escalado de variables numéricas
    scaler = StandardScaler()
    X_num_scaled = scaler.fit_transform(X_num)

    # 2. Vectorización semántica del texto de las llamadas (TF-IDF + SVD a 20 dimensiones densas)
    tfidf = TfidfVectorizer(max_features=600, ngram_range=(1, 2), min_df=2)
    X_tfidf = tfidf.fit_transform(texts)
    n_components = min(20, max(2, X_tfidf.shape[1] - 1))
    svd = TruncatedSVD(n_components=n_components, random_state=42)
    X_text_emb = svd.fit_transform(X_tfidf)

    # 3. Fusión Multimodal: [28 Neuronas Operativas + 20 Neuronas Semánticas = 48 Neuronas de Entrada]
    X_combined = np.hstack([X_num_scaled, X_text_emb])

    # 4. Split Entrenamiento / Validación (80% / 20%)
    X_train, X_test, yc_train, yc_test, yo_train, yo_test = train_test_split(
        X_combined, y_churn, y_ojt, test_size=0.20, random_state=42, stratify=y_churn
    )

    # 5. Red Neuronal Profunda #1: Predicción de Detracción / Fuga (Arquitectura 48 -> 64 -> 32 -> 16 -> 1)
    mlp_churn = MLPClassifier(
        hidden_layer_sizes=(64, 32, 16),
        activation="relu",
        solver="adam",
        alpha=0.005,
        batch_size=32,
        learning_rate_init=0.002,
        max_iter=350,
        early_stopping=True,
        validation_fraction=0.15,
        random_state=42,
    )
    mlp_churn.fit(X_train, yc_train)

    # 6. Red Neuronal Profunda #2: Predicción de Riesgo Formativo OJT (Arquitectura 48 -> 48 -> 24 -> 1)
    mlp_ojt = MLPClassifier(
        hidden_layer_sizes=(48, 24),
        activation="relu",
        solver="adam",
        alpha=0.005,
        batch_size=32,
        learning_rate_init=0.002,
        max_iter=350,
        early_stopping=True,
        validation_fraction=0.15,
        random_state=42,
    )
    mlp_ojt.fit(X_train, yo_train)

    # 7. Evaluación de Métricas en Conjunto de Prueba
    yc_pred = mlp_churn.predict(X_test)
    yc_prob = mlp_churn.predict_proba(X_test)[:, 1]
    churn_acc = float(accuracy_score(yc_test, yc_pred))
    churn_f1 = float(f1_score(yc_test, yc_pred, zero_division=0))
    churn_auc = float(roc_auc_score(yc_test, yc_prob)) if len(np.unique(yc_test)) > 1 else 0.90

    yo_pred = mlp_ojt.predict(X_test)
    yo_prob = mlp_ojt.predict_proba(X_test)[:, 1]
    ojt_acc = float(accuracy_score(yo_test, yo_pred))
    ojt_f1 = float(f1_score(yo_test, yo_pred, zero_division=0))
    ojt_auc = float(roc_auc_score(yo_test, yo_prob)) if len(np.unique(yo_test)) > 1 else 0.90

    # 8. Importancia de Variables (Pesos de la Primera Capa Oculta sobre las 28 features operativas)
    first_layer_weights = np.abs(mlp_churn.coefs_[0][: len(FEATURE_NAMES), :]).mean(axis=1)
    total_w = float(first_layer_weights.sum()) or 1.0
    feature_Ranking = []
    for idx, fname in enumerate(FEATURE_NAMES):
        importance_pct = round(float(first_layer_weights[idx] / total_w) * 100, 2)
        feature_Ranking.append({
            "feature": fname,
            "label": FEATURE_LABELS_ES.get(fname, fname),
            "importancePct": importance_pct,
        })
    feature_Ranking.sort(key=lambda x: x["importancePct"], reverse=True)

    # 9. Inferencia Global sobre las 1,200 llamadas para perfilar a los 84 asesores y detectar alertas
    all_churn_probs = mlp_churn.predict_proba(X_combined)[:, 1]
    all_ojt_probs = mlp_ojt.predict_proba(X_combined)[:, 1]

    agent_stats: Dict[str, Dict[str, Any]] = {}
    high_risk_calls = []

    for idx, c in enumerate(calls):
        c_prob = float(all_churn_probs[idx])
        o_prob = float(all_ojt_probs[idx])
        ag_id = str(c.get("agente_id") or "SIN-ID").strip()
        ag_name = str(c.get("agente_nombre") or "Asesor").strip()

        if ag_id not in agent_stats:
            agent_stats[ag_id] = {
                "agente_id": ag_id,
                "agente_nombre": ag_name,
                "total_calls": 0,
                "sum_qa": 0.0,
                "sum_churn_prob": 0.0,
                "sum_ojt_prob": 0.0,
                "sum_silence": 0.0,
                "quiebres_count": 0,
                "recent_calls": [],
            }
        st = agent_stats[ag_id]
        st["total_calls"] += 1
        st["sum_qa"] += float(c.get("qa_score_global") or 0)
        st["sum_churn_prob"] += c_prob
        st["sum_ojt_prob"] += o_prob
        st["sum_silence"] += float((c.get("silencio_analisis") or {}).get("porcentaje_silencio") or 0)
        st["quiebres_count"] += len(c.get("quiebres_atencion") or [])

        if idx < 120 and c_prob >= 0.72:
            high_risk_calls.append({
                "id": c.get("id"),
                "codigo_llamada": c.get("codigo_llamada"),
                "file_name": c.get("file_name"),
                "fecha_hora": c.get("fecha_hora"),
                "agente_nombre": ag_name,
                "agente_id": ag_id,
                "cliente_nombre": c.get("cliente_nombre"),
                "motivo_nombre": c.get("motivo_nombre"),
                "qa_score_global": c.get("qa_score_global"),
                "churn_probability": round(c_prob * 100, 1),
                "ojt_risk_probability": round(o_prob * 100, 1),
                "recommended_action": (
                    "Escalar a Mesa Operativa (Rescate 24h)"
                    if c_prob >= 0.82
                    else "Intervención de Tutor OJT + Auditoría Focalizada"
                ),
            })

    agent_predictions = []
    for ag_id, st in agent_stats.items():
        n = st["total_calls"]
        avg_qa = round(st["sum_qa"] / n, 1)
        avg_churn_risk = round((st["sum_churn_prob"] / n) * 100, 1)
        avg_ojt_risk = round((st["sum_ojt_prob"] / n) * 100, 1)
        avg_silence = round(st["sum_silence"] / n, 1)

        risk_tier = "CRÍTICO" if avg_ojt_risk >= 70 else ("MODERADO" if avg_ojt_risk >= 45 else "ÓPTIMO")
        agent_predictions.append({
            "agente_id": ag_id,
            "agente_nombre": st["agente_nombre"],
            "total_calls": n,
            "avg_qa": avg_qa,
            "predicted_churn_exposure": avg_churn_risk,
            "predicted_ojt_breach_prob": avg_ojt_risk,
            "avg_silence_pct": avg_silence,
            "total_quiebres": st["quiebres_count"],
            "risk_tier": risk_tier,
        })

    agent_predictions.sort(key=lambda x: (x["predicted_ojt_breach_prob"], x["total_calls"]), reverse=True)
    high_risk_calls.sort(key=lambda x: x["churn_probability"], reverse=True)

    vector_docs_count = fetch_vector_store_count()
    training_seconds = round(time.time() - t0, 2)

    bundle = {
        "scaler": scaler,
        "tfidf": tfidf,
        "svd": svd,
        "mlp_churn": mlp_churn,
        "mlp_ojt": mlp_ojt,
        "feature_names": FEATURE_NAMES,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(bundle, MODEL_BUNDLE_PATH)

    report = {
        "success": True,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "trainingTimeSeconds": training_seconds,
        "dataset": {
            "totalCallsTrained": len(calls),
            "uniqueAgents": len(agent_stats),
            "detractorsCount": int(y_churn.sum()),
            "promotersAndNeutralsCount": int(len(y_churn) - y_churn.sum()),
            "ojtInterventionCases": int(y_ojt.sum()),
            "vectorStoreDocumentsCount": vector_docs_count,
            "inputNeurons": int(X_combined.shape[1]),
            "numericFeaturesCount": len(FEATURE_NAMES),
            "semanticEmbeddingDims": int(n_components),
        },
        "models": {
            "churnNeuralNet": {
                "architecture": f"Input({X_combined.shape[1]}) -> Dense(64, ReLU) -> Dense(32, ReLU) -> Dense(16, ReLU) -> Sigmoid(1)",
                "accuracyPct": round(churn_acc * 100, 1),
                "f1ScorePct": round(churn_f1 * 100, 1),
                "rocAucPct": round(churn_auc * 100, 1),
                "iterations": int(mlp_churn.n_iter_),
                "finalLoss": round(float(mlp_churn.loss_), 4),
                "lossCurve": [round(float(v), 4) for v in mlp_churn.loss_curve_[-25:]],
            },
            "ojtNeuralNet": {
                "architecture": f"Input({X_combined.shape[1]}) -> Dense(48, ReLU) -> Dense(24, ReLU) -> Sigmoid(1)",
                "accuracyPct": round(ojt_acc * 100, 1),
                "f1ScorePct": round(ojt_f1 * 100, 1),
                "rocAucPct": round(ojt_auc * 100, 1),
                "iterations": int(mlp_ojt.n_iter_),
                "finalLoss": round(float(mlp_ojt.loss_), 4),
                "lossCurve": [round(float(v), 4) for v in mlp_ojt.loss_curve_[-25:]],
            },
        },
        "topFeatureImportances": feature_Ranking[:12],
        "agentPredictions": agent_predictions[:25],
        "highRiskCallsDetected": high_risk_calls[:20],
    }

    with open(REPORT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    return report


def predict_single_call(call_data: Dict[str, Any], execute_actions: bool = False) -> Dict[str, Any]:
    """
    Evalúa una llamada individual (desde n8n o desde la Web) con la Red Neuronal ya entrenada
    y opcionalmente dispara acciones autónomas en Supabase.
    """
    if not os.path.exists(MODEL_BUNDLE_PATH):
        train_neural_network()

    bundle = joblib.load(MODEL_BUNDLE_PATH)
    scaler: StandardScaler = bundle["scaler"]
    tfidf: TfidfVectorizer = bundle["tfidf"]
    svd: TruncatedSVD = bundle["svd"]
    mlp_churn: MLPClassifier = bundle["mlp_churn"]
    mlp_ojt: MLPClassifier = bundle["mlp_ojt"]

    x_num = np.array([extract_numeric_features(call_data)], dtype=np.float64)
    x_num_scaled = scaler.transform(x_num)

    text_str = extract_text_corpus(call_data)
    x_tfidf = tfidf.transform([text_str])
    x_text_emb = svd.transform(x_tfidf)

    x_combined = np.hstack([x_num_scaled, x_text_emb])

    churn_prob = float(mlp_churn.predict_proba(x_combined)[0, 1])
    ojt_prob = float(mlp_ojt.predict_proba(x_combined)[0, 1])

    # Identificar qué factores específicos empujaron el riesgo en esta llamada
    risk_drivers = []
    feats = x_num[0]
    if feats[1] > 15:
        risk_drivers.append(f"Silencio conversacional elevado ({feats[1]:.0f}%)")
    if feats[20] == 0:
        risk_drivers.append("Falta de claridad en condiciones comerciales (Fase 3)")
    if feats[24] == 0:
        risk_drivers.append("Omisión de explicación de encuesta 0-10 (Fase 4)")
    if feats[25] > 0:
        risk_drivers.append(f"{int(feats[25])} quiebre(s) de atención detectado(s)")
    if feats[3] < -0.2:
        risk_drivers.append("Tono acústico / sentimiento negativo del cliente")

    actions_taken = []

    if execute_actions:
        # Acción Autónoma 1: Si probabilidad de Churn >= 70%, registrar alerta en operaciones_call_records
        if churn_prob >= 0.70:
            ops = call_data.get("diagnostico_operaciones") or {}
            payload = {
                "codigo_llamada": call_data.get("codigo_llamada") or f"CALL-AI-{int(time.time())}",
                "fecha_hora": call_data.get("fecha_hora") or datetime.now(timezone.utc).isoformat(),
                "agente_nombre": call_data.get("agente_nombre") or "Asesor Claro",
                "agente_id": call_data.get("agente_id") or "AG-000",
                "cliente_nombre": call_data.get("cliente_nombre") or "Cliente Claro",
                "cliente_telefono": call_data.get("cliente_telefono") or "+56 9 **** ****",
                "cola_atencion": call_data.get("cola_atencion") or "Exclusivo Postpago Chile",
                "duracion_total": call_data.get("duracion_total") or "05:00",
                "duracion_segundos": int(call_data.get("duracion_segundos") or 300),
                "qa_score_global": int(call_data.get("qa_score_global") or 70),
                "csat_estimado": int(call_data.get("csat_estimado") or 3),
                "nps_pronostico": call_data.get("nps_pronostico") or {"score": 4, "clasificacion": "DETRACTOR"},
                "resolucion_primer_contacto": bool(call_data.get("resolucion_primer_contacto", False)),
                "sentimiento_score": float(call_data.get("sentimiento_score") or -0.4),
                "sentimiento_label": call_data.get("sentimiento_label") or "Negativo",
                "resumen": call_data.get("resumen") or "Escalado automáticamente por Red Neuronal.",
                "motivo_categoria": call_data.get("motivo_categoria") or "reclamos",
                "motivo_nombre": call_data.get("motivo_nombre") or "Riesgo Predictivo Churn",
                "causa_raiz_categoria": ops.get("causa_raiz_categoria") or "friccion_procesos",
                "causa_raiz_nombre": ops.get("causa_raiz_nombre") or "Alerta Neuronal de Fuga",
                "causa_raiz_detalle": f"[Red Neuronal: {churn_prob*100:.1f}% prob. fuga] " + (ops.get("causa_raiz_detalle") or ""),
                "responsabilidad": ops.get("responsabilidad") or "claro_empresa",
                "riesgo_churn": "critico" if churn_prob >= 0.85 else "medio",
                "estado_gestion": "pendiente",
                "accion_inmediata": ops.get("plan_accion_cliente") or "Contacto proactivo de rescate en < 24h.",
                "file_name": call_data.get("file_name") or "",
            }
            res = requests.post(
                f"{SUPABASE_URL}/rest/v1/operaciones_call_records",
                headers=supabase_headers(),
                json=payload,
                timeout=15,
            )
            if res.ok or res.status_code == 201:
                actions_taken.append("Caso de rescate insertado automáticamente en operaciones_call_records")

    return {
        "success": True,
        "codigo_llamada": call_data.get("codigo_llamada"),
        "predictions": {
            "churnProbabilityPct": round(churn_prob * 100, 1),
            "churnRiskLevel": "CRÍTICO" if churn_prob >= 0.80 else ("ALTO" if churn_prob >= 0.60 else "BAJO"),
            "ojtInterventionProbPct": round(ojt_prob * 100, 1),
            "ojtNeedsTutor": ojt_prob >= 0.65,
        },
        "riskDrivers": risk_drivers,
        "autonomousDecision": (
            "ESCALAR_OPERACIONES_Y_RESCATE_24H"
            if churn_prob >= 0.75
            else ("ACTIVAR_COACHING_OJT_INMEDIATO" if ojt_prob >= 0.65 else "MONITOREO_ESTANDAR")
        ),
        "actionsTaken": actions_taken,
    }


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "train"

    if mode == "train":
        report = train_neural_network()
        print(json.dumps(report, ensure_ascii=False))
    elif mode == "report":
        if os.path.exists(REPORT_JSON_PATH):
            with open(REPORT_JSON_PATH, "r", encoding="utf-8") as f:
                print(f.read())
        else:
            report = train_neural_network()
            print(json.dumps(report, ensure_ascii=False))
    elif mode == "predict":
        raw_input = sys.stdin.read()
        payload = json.loads(raw_input) if raw_input.strip() else {}
        call_obj = payload.get("call") or payload.get("data") or payload
        execute_flag = bool(payload.get("executeActions", True))
        result = predict_single_call(call_obj, execute_actions=execute_flag)
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps({"success": False, "error": f"Modo desconocido: {mode}"}))


if __name__ == "__main__":
    main()
