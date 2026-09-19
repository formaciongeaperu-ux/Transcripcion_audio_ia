import React from 'react';

interface GeaLogoProps {
  className?: string;
  size?: number;
}

export const GeaLogo: React.FC<GeaLogoProps> = ({ className = 'h-9 w-auto', size = 38 }) => {
  return (
    <svg
      width={size}
      height={Math.round((size * 34) / 38)}
      viewBox="0 0 120 105"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo GEA Perú"
    >
      {/* Navy blue structural triangle frame: left diagonal wall, apex and bottom base */}
      <path
        d="M48 6 L14 82 C11 89, 16 96, 24 96 L104 96 C111 96, 115 90, 112 84 L107 74 C104 70, 99 69, 94 69 L39 69 C33 69, 30 65, 33 59 L57 14 C59 9, 54 4, 48 6 Z"
        fill="#072242"
      />

      {/* Top Level: Green horizontal rounded bar */}
      <rect x="52" y="15" width="28" height="13" rx="6.5" fill="#00A859" />

      {/* Middle Level: Vibrant Blue horizontal rounded bar */}
      <rect x="42" y="38" width="46" height="14" rx="7" fill="#0072CE" />

      {/* Bottom Level: Red-Orange horizontal rounded bar */}
      <rect x="30" y="62" width="68" height="15" rx="7.5" fill="#FF4D00" />
    </svg>
  );
};
