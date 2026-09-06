import React from 'react';
import { EvaluacionCriterios } from '../types';

interface RadarChartProps {
  criterios: EvaluacionCriterios;
  size?: number;
}

export const RadarChart: React.FC<RadarChartProps> = ({ criterios, size = 300 }) => {
  const center = size / 2;
  const radius = size * 0.38;

  // 5 axes configuration
  const axes = [
    { label: 'Amabilidad', value: criterios?.amabilidad_empatia?.nota ?? 50 },
    { label: 'Seguridad', value: criterios?.seguridad_expresarse?.nota ?? 50 },
    { label: 'Claridad', value: criterios?.claridad_informacion?.nota ?? 50 },
    { label: 'Tiempos', value: criterios?.tiempos_espera_hold?.nota ?? 50 },
    { label: 'TMO', value: criterios?.eficiencia_tmo?.nota ?? 50 },
  ];

  const totalAxes = axes.length;
  const angleStep = (Math.PI * 2) / totalAxes;

  // Concentric levels (25, 50, 75, 100)
  const levels = [25, 50, 75, 100];

  // Helper to calculate coordinates
  const getCoordinates = (index: number, val: number) => {
    // Start at top (-PI/2)
    const angle = index * angleStep - Math.PI / 2;
    const distance = (val / 100) * radius;
    const x = center + distance * Math.cos(angle);
    const y = center + distance * Math.sin(angle);
    return { x, y };
  };

  // Build points string for data polygon
  const polygonPoints = axes
    .map((axis, i) => {
      const { x, y } = getCoordinates(i, axis.value);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width={size} height={size} className="overflow-visible">
        {/* Background Grid Rings */}
        {levels.map((level) => {
          const levelPoints = axes
            .map((_, i) => {
              const { x, y } = getCoordinates(i, level);
              return `${x},${y}`;
            })
            .join(' ');

          return (
            <polygon
              key={`level-${level}`}
              points={levelPoints}
              fill="none"
              stroke="#E8EAED"
              strokeWidth="1.2"
              strokeDasharray={level === 100 ? 'none' : '3,3'}
            />
          );
        })}

        {/* Axis Lines from center */}
        {axes.map((_, i) => {
          const { x, y } = getCoordinates(i, 100);
          return (
            <line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="#DADCE0"
              strokeWidth="1.2"
            />
          );
        })}

        {/* Level labels (25, 50, 75, 100) along top-right diagonal */}
        {levels.map((level) => {
          const { x, y } = getCoordinates(1, level);
          return (
            <text
              key={`lbl-${level}`}
              x={x + 6}
              y={y + 3}
              fontSize="9"
              fill="#9AA0A6"
              fontWeight="500"
              fontFamily="Roboto, sans-serif"
            >
              {level}
            </text>
          );
        })}

        {/* Shaded Data Polygon (Rose / Google Accent matching screenshot) */}
        <polygon
          points={polygonPoints}
          fill="rgba(234, 67, 53, 0.18)" // Soft pink/red shade matching Claro / screenshot
          stroke="#EA4335"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className="transition-all duration-500"
        />

        {/* Vertex points on polygon */}
        {axes.map((axis, i) => {
          const { x, y } = getCoordinates(i, axis.value);
          return (
            <circle
              key={`point-${i}`}
              cx={x}
              cy={y}
              r="4"
              fill="#EA4335"
              stroke="#FFFFFF"
              strokeWidth="2"
              className="transition-all duration-500"
            />
          );
        })}

        {/* Axis Labels outside the radar */}
        {axes.map((axis, i) => {
          const labelDist = radius + 24;
          const angle = i * angleStep - Math.PI / 2;
          const x = center + labelDist * Math.cos(angle);
          const y = center + labelDist * Math.sin(angle);

          let textAnchor = 'middle';
          if (Math.cos(angle) > 0.3) textAnchor = 'start';
          if (Math.cos(angle) < -0.3) textAnchor = 'end';

          return (
            <text
              key={`axis-label-${i}`}
              x={x}
              y={y}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              fontSize="11"
              fontWeight="600"
              fill="#3C4043"
              fontFamily="Google Sans, Roboto, sans-serif"
            >
              {axis.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
};
