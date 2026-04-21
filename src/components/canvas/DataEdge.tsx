import { useState } from 'react'
import { getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { X, Check } from 'lucide-react'
import type { EdgeContextMode } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'

const MODE_CONFIG: Record<EdgeContextMode, {
  stroke: string
  strokeDasharray?: string
  label: string
  labelColor: string
  borderColor: string
  bgColor: string
  description: string
}> = {
  full: {
    stroke: 'rgba(139,92,246,0.65)',
    label: 'Full',
    labelColor: 'text-purple-300',
    borderColor: 'border-purple-500/40',
    bgColor: 'bg-purple-500/10',
    description: 'Sees all prior outputs',
  },
  previous: {
    stroke: 'rgba(245,158,11,0.65)',
    strokeDasharray: '6 3',
    label: 'Prev',
    labelColor: 'text-amber-300',
    borderColor: 'border-amber-500/40',
    bgColor: 'bg-amber-500/10',
    description: 'Sees only the previous output',
  },
  none: {
    stroke: 'rgba(148,163,184,0.30)',
    strokeDasharray: '2 5',
    label: 'None',
    labelColor: 'text-slate-400',
    borderColor: 'border-slate-500/30',
    bgColor: 'bg-slate-500/8',
    description: 'No context passed',
  },
}

export default function DataEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  selected,
  data,
}: EdgeProps) {
  const { deleteElements } = useReactFlow()
  const { removeEdge, updateEdge } = useWorkflowStore()
  const [showMenu, setShowMenu] = useState(false)

  const contextMode: EdgeContextMode = (data?.contextMode as EdgeContextMode) ?? 'full'
  const config = MODE_CONFIG[contextMode] ?? MODE_CONFIG.full

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    deleteElements({ edges: [{ id }] })
    removeEdge(id)
    setShowMenu(false)
  }

  function handleRightClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setShowMenu((v) => !v)
  }

  function setMode(mode: EdgeContextMode) {
    updateEdge(id, { contextMode: mode })
    setShowMenu(false)
  }

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          stroke: config.stroke,
          strokeDasharray: config.strokeDasharray,
          strokeWidth: selected ? 2.5 : 1.8,
          fill: 'none',
        }}
        markerEnd={`url(#edge-arrow-${contextMode})`}
      />

      {/* Wide invisible hit area for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        className="react-flow__edge-interaction"
        onContextMenu={handleRightClick}
      />

      {/* Context mode badge */}
      <foreignObject
        x={labelX - 20}
        y={labelY - 11}
        width={40}
        height={22}
        className="overflow-visible pointer-events-none"
      >
        <div className={`h-full flex items-center justify-center rounded-md border text-xs font-mono font-semibold tracking-wide ${config.labelColor} ${config.borderColor} bg-[#0a0a0d]/90`}>
          {config.label}
        </div>
      </foreignObject>

      {/* Delete button — visible when selected */}
      {selected && (
        <foreignObject
          x={labelX + 24}
          y={labelY - 10}
          width={20}
          height={20}
          className="overflow-visible"
        >
          <button
            onClick={handleDelete}
            title="Delete connection"
            className="w-5 h-5 rounded-full bg-[#1a1a22] border border-white/20 text-white/35 hover:text-red-400 hover:border-red-500/50 hover:bg-[#221a1a] flex items-center justify-center transition-colors"
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        </foreignObject>
      )}

      {/* Right-click context menu */}
      {showMenu && (
        <foreignObject
          x={labelX - 70}
          y={labelY + 16}
          width={152}
          height={148}
          className="overflow-visible"
          style={{ zIndex: 1000 }}
        >
          <div
            className="bg-[#1a1a22] border border-white/12 rounded-xl shadow-2xl py-1.5 overflow-hidden"
            onMouseLeave={() => setShowMenu(false)}
          >
            <p className="text-xs text-white/25 uppercase tracking-widest px-3 pb-1 pt-0.5">Context mode</p>
            {(Object.entries(MODE_CONFIG) as [EdgeContextMode, typeof MODE_CONFIG[EdgeContextMode]][]).map(([mode, cfg]) => (
              <button
                key={mode}
                onClick={() => setMode(mode)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-white/6 ${
                  contextMode === mode ? cfg.labelColor + ' font-medium' : 'text-white/55'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${contextMode === mode ? cfg.bgColor.replace('bg-', 'bg-') : 'bg-white/15'}`}
                  style={{ background: contextMode === mode ? cfg.stroke : undefined }}
                />
                {cfg.label === 'Full' ? 'Full context' : cfg.label === 'Prev' ? 'Previous only' : 'No context'}
                {contextMode === mode && <Check size={11} className="ml-auto shrink-0" />}
              </button>
            ))}
            <div className="h-px bg-white/8 mx-2 my-1" />
            <button
              onClick={handleDelete}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/8 transition-colors"
            >
              Delete edge
            </button>
          </div>
        </foreignObject>
      )}

      {/* SVG arrow marker defs — one per mode */}
      <defs>
        <marker id="edge-arrow-full" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(139,92,246,0.65)" />
        </marker>
        <marker id="edge-arrow-previous" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(245,158,11,0.65)" />
        </marker>
        <marker id="edge-arrow-none" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(148,163,184,0.30)" />
        </marker>
      </defs>
    </>
  )
}
