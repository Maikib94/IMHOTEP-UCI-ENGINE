// src/components/GeometricLung.tsx
//
// ═══════════════════════════════════════════════════════════════════════════════
//  GeometricLung — visualización procedural de la mecánica respiratoria
// ═══════════════════════════════════════════════════════════════════════════════
/* eslint-disable react/forbid-dom-props */
//
//  Dark-mode, Glass UI, sin representación anatómica. Un polígono
//  procedural evolutivo cuyo mapeo matemático es:
//
//    scale       ∝ ∫V̇(t)dt     (volumen acumulado)
//    vertexSharp ∝ 1/Crs        (rigidez: baja compliance → más aristas)
//    glowHue     ∝ Paw(t)       (ciano → rojo según presión)
//    pulseOmega  ∝ f_resp       (respiraciones/min)
//
//  Renderiza a 60 FPS via rAF, independiente del physics loop (240 Hz).
//
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef } from 'react';
import { RespiratoryEngine } from '../core/RespiratoryEngine';

interface Props {
  width?: number;
  height?: number;
  /** Si es true, superpone etiquetas numéricas (modo depuración/instructor). */
  showNumeric?: boolean;
}

// ─── PALETAS DE COLOR (HSL en grados) ────────────────────────────────────────
//   Paw bajo (PEEP)            → #22D3EE (cian)     HSL(188, 83%, 53%)
//   Paw normal (15 cmH₂O)      → #34D399 (verde)    HSL(158, 64%, 52%)
//   Paw alta (25 cmH₂O)        → #F59E0B (ambar)    HSL(38, 92%, 50%)
//   Paw crítica (>35 cmH₂O)    → #EF4444 (rojo)     HSL(0, 84%, 60%)

function pawToHSL(paw: number): string {
  // Interpolación lineal en HSL por tramos
  if (paw <= 5) return `hsl(188, 83%, 53%)`;
  if (paw <= 15) {
    const t = (paw - 5) / 10;
    return `hsl(${188 + (158 - 188) * t}, ${83 + (64 - 83) * t}%, ${53 - 1 * t}%)`;
  }
  if (paw <= 25) {
    const t = (paw - 15) / 10;
    return `hsl(${158 + (38 - 158) * t}, ${64 + (92 - 64) * t}%, ${52 - 2 * t}%)`;
  }
  if (paw <= 35) {
    const t = (paw - 25) / 10;
    return `hsl(${38 + (0 - 38) * t}, ${92 - 8 * t}%, ${50 + (60 - 50) * t}%)`;
  }
  return `hsl(0, 84%, ${60 + Math.min(15, (paw - 35) * 1.5)}%)`;
}

// ─── GENERACIÓN DEL POLÍGONO ─────────────────────────────────────────────────
//
//  Se construye un polígono de N vértices donde cada vértice está a una
//  distancia radial:
//
//      r_i = r_base · [1 + sharpness · cos(k_i · θ_i + φ)]
//
//  donde k_i depende de la paridad del vértice (para crear estrellas/facetas)
//  y `sharpness` = f(1/Crs):
//
//      sharpness = clamp(1 - Crs/60, 0, 1)  → 0 a Crs=60, 1 a Crs=0
//
//  Esto produce:
//      - Compliance alta (60 mL/cmH₂O):  polígono ≈ círculo suave
//      - Compliance moderada (25):       estrella suave 12-puntas
//      - Compliance severa SDRA (8):     estrella afilada, "rígida"
//
function buildPolygonPath(
  cx: number, cy: number,
  rBase: number,                 // radio base (escalado por volumen)
  sharpness: number,             // 0..1 (rigidez)
  breathPhase: number,           // 0..2π
  seed: number,                  // variación determinística por instancia
): string {
  const N = 36;                  // vértices (alta resolución)
  const pts: string[] = [];
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * 2 * Math.PI;
    // Capas armónicas (2, 5, 8) → geometría compleja pero no caótica
    const harmonic =
      0.6 * Math.cos(2 * theta + breathPhase) +
      0.3 * Math.cos(5 * theta + seed) +
      0.1 * Math.cos(8 * theta + breathPhase * 0.5);
    const r = rBase * (1 + sharpness * 0.35 * harmonic);
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts[0]} L${pts.slice(1).join(' L')} Z`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMPONENTE
// ═══════════════════════════════════════════════════════════════════════════════

export const GeometricLung: React.FC<Props> = ({
  width = 360,
  height = 360,
  showNumeric = true,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const txtVolRef = useRef<SVGTextElement>(null);
  const txtPawRef = useRef<SVGTextElement>(null);
  const txtCrsRef = useRef<SVGTextElement>(null);
  const txtModeRef = useRef<SVGTextElement>(null);
  const rafRef = useRef<number>(0);
  const seedRef = useRef<number>(Math.random() * Math.PI * 2);

  useEffect(() => {
    const engine = RespiratoryEngine.getInstance().getVentEngine();
    const cx = width / 2;
    const cy = height / 2;
    const rMax = Math.min(width, height) * 0.38;

    // Factor de calibración: vol máximo esperado 800 mL → rMax
    const VOL_REF = 800;

    let lastPaint = performance.now();

    const render = (now: number) => {
      // Cap 60 FPS
      const dt = now - lastPaint;
      if (dt < 16) { rafRef.current = requestAnimationFrame(render); return; }
      lastPaint = now;

      const st = engine.getInstantState();
      const breath = engine.getLastBreath();

      // ── Escala por volumen ─────────────────────────────────────────────
      const volRatio = Math.max(0.15, Math.min(1.2, st.vol / VOL_REF));
      const rBase = rMax * volRatio;

      // ── Rigidez por compliance ─────────────────────────────────────────
      const crs = breath.cStatMeasured > 0 ? breath.cStatMeasured : 50;
      const sharpness = Math.max(0, Math.min(1, 1 - crs / 60));

      // ── Fase respiratoria para animación armónica sutil ────────────────
      const phase = (now / 2500) * 2 * Math.PI;

      // ── Color por Paw instantánea ──────────────────────────────────────
      const color = pawToHSL(st.paw);

      // ── Construir path del polígono ────────────────────────────────────
      const d = buildPolygonPath(cx, cy, rBase, sharpness, phase, seedRef.current);
      if (pathRef.current) {
        pathRef.current.setAttribute('d', d);
        pathRef.current.setAttribute('stroke', color);
        pathRef.current.setAttribute('fill', color + '22'); // alpha ~13%
      }
      if (glowRef.current) {
        // Polígono mayor con blur para efecto glow
        glowRef.current.setAttribute('d', d);
        glowRef.current.setAttribute('stroke', color);
        // Opacidad del glow escala con Paw (más intensa a presiones altas)
        const glowOp = Math.max(0.1, Math.min(0.8, (st.paw - 5) / 30));
        glowRef.current.setAttribute('opacity', glowOp.toFixed(2));
      }

      // Anillo interno pulsante (respiración visible)
      if (ringRef.current) {
        ringRef.current.setAttribute('r', (rBase * 0.15).toFixed(2));
        ringRef.current.setAttribute('stroke', color);
      }

      // Etiquetas numéricas
      if (showNumeric) {
        if (txtVolRef.current) txtVolRef.current.textContent = `${Math.round(st.vol)} mL`;
        if (txtPawRef.current) txtPawRef.current.textContent = `${st.paw.toFixed(1)} cmH₂O`;
        if (txtCrsRef.current) txtCrsRef.current.textContent = `${crs.toFixed(0)} mL/cmH₂O`;
        if (txtModeRef.current) txtModeRef.current.textContent = breath.acpFlag ? 'ACP ⚠' : 'STABLE';
        if (txtModeRef.current) txtModeRef.current.setAttribute('fill', breath.acpFlag ? '#ef4444' : '#a3e635');
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, showNumeric]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        background: 'radial-gradient(circle at 50% 50%, #0a1220 0%, #030509 80%)',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.85), 0 4px 20px rgba(0,0,0,0.6)',
      }}
    >
      {/* Grid geométrico de fondo (retícula tenue dark-mode) */}
      <defs>
        <pattern id="gl-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none"
            stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
        </pattern>
        <filter id="gl-blur">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id="gl-softblur">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>
      <rect width={width} height={height} fill="url(#gl-grid)" />

      {/* Glow outer (polígono blur) */}
      <path
        ref={glowRef}
        fill="none"
        strokeWidth={12}
        strokeLinejoin="round"
        filter="url(#gl-blur)"
      />

      {/* Polígono principal (trazo afilado) */}
      <path
        ref={pathRef}
        strokeWidth={1.8}
        strokeLinejoin="round"
        filter="url(#gl-softblur)"
      />

      {/* Núcleo: pulso central */}
      <circle
        ref={ringRef}
        cx={width / 2}
        cy={height / 2}
        r={18}
        fill="none"
        strokeWidth={1.5}
        opacity={0.85}
      />
      <circle
        cx={width / 2}
        cy={height / 2}
        r={2.5}
        fill="#e0f7ff"
        opacity={0.9}
      />

      {/* HUD numérico (dark-mode, mono) */}
      {showNumeric && (
        <g
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize={10}
          fill="#64748b"
        >
          {/* Top-left: Volume */}
          <text x={14} y={20} fill="#94a3b8" fontSize={9} letterSpacing="0.1em">VOL</text>
          <text ref={txtVolRef} x={14} y={34} fill="#22d3ee" fontSize={14} fontWeight={600}>-- mL</text>

          {/* Top-right: Paw */}
          <text x={width - 14} y={20} textAnchor="end"
            fill="#94a3b8" fontSize={9} letterSpacing="0.1em">P_AW</text>
          <text ref={txtPawRef} x={width - 14} y={34} textAnchor="end"
            fill="#34d399" fontSize={14} fontWeight={600}>--</text>

          {/* Bottom-left: Crs */}
          <text x={14} y={height - 22} fill="#94a3b8" fontSize={9}
            letterSpacing="0.1em">C_RS</text>
          <text ref={txtCrsRef} x={14} y={height - 8} fill="#a3e635" fontSize={12}
            fontWeight={600}>--</text>

          {/* Bottom-right: mode/flag */}
          <text x={width - 14} y={height - 22} textAnchor="end"
            fill="#94a3b8" fontSize={9} letterSpacing="0.1em">STATE</text>
          <text ref={txtModeRef} x={width - 14} y={height - 8} textAnchor="end"
            fontSize={12} fontWeight={700}>STABLE</text>
        </g>
      )}
    </svg>
  );
};

export default GeometricLung;
