import { useState } from 'react'
import { getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { X } from 'lucide-react'
import type { EdgeContextMode } from '../../types'
import { useWorkflowStore } from '../../stores/workflowStore'

const MODE_STYLES: Record<EdgeContextMode, { stroke: string; strokeDasharray?: string; label: string }> = {
  full:     { stroke: 'rgba(139,92,246,0.65)', label: 'full' },
  previous: { stroke: 'rgba(245,158,11,0.65)', strokeDasharray: '6 3', label: 'prev' },
  none:     { stroke: 'rgba(148,163,184,0.30)', strokeDasharray: '2 5', label: 'none' },
}

export default function DataEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const { deleteElements } = useReactFlow()
  const { removeEdge, updateEdge } = useWorkflowStore()
  const [showMenu, setShowMenu] = useState(false)

  const contextMode: EdgeContextMode = (data?.contextMode as EdgeContextMode) ?? 'full'
  const style = MODE_STYLES[contextMode] ?? MODE_STYLES.full

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
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
          stroke: style.stroke,
          strokeDasharray: style.strokeDasharray,
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
        x={labelX - 16}
        y={labelY - 8}
        width={32}
        height={16}
        className="overflow-visible pointer-events-none"
      >
        <div
          style={{
            fontSize: 8,
            fontFamily: 'monospace',
            color: style.stroke,
            background: 'rgba(10,10,13,0.85)',
            border: `1px solid ${style.stroke}`,
            borderRadius: 3,
            padding: '0 3px',
            lineHeight: '14px',
            textAlign: 'center',
            opacity: 0.85,
            whiteSpace: 'nowrap',
          }}
        >
          {style.label}
        </div>
      </foreignObject>

      {/* Delete button — visible when selected */}
      <foreignObject
        x={labelX + 18}
        y={labelY - 9}
        width={18}
        height={18}
        className="overflow-visible"
        style={{ display: selected ? 'block' : 'none' }}
      >
        <button
          onClick={handleDelete}
          title="Delete connection"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#1a1a22',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget
            el.style.color = '#f87171'
            el.style.borderColor = 'rgba(239,68,68,0.5)'
            el.style.background = '#221a1a'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget
            el.style.color = 'rgba(255,255,255,0.35)'
            el.style.borderColor = 'rgba(255,255,255,0.2)'
            el.style.background = '#1a1a22'
          }}
        >
          <X size={9} strokeWidth={2.5} />
        </button>
      </foreignObject>

      {/* Right-click context menu */}
      {showMenu && (
        <foreignObject
          x={labelX - 65}
          y={labelY + 14}
          width={140}
          height={110}
          className="overflow-visible"
          style={{ zIndex: 1000 }}
        >
          <div
            style={{
              background: '#1a1a22',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              padding: '4px 0',
              fontSize: 11,
            }}
            onMouseLeave={() => setShowMenu(false)}
          >
            <MenuRow
              label="Full context"
              active={contextMode === 'full'}
              color="rgba(139,92,246,0.8)"
              onClick={() => setMode('full')}
            />
            <MenuRow
              label="Previous only"
              active={contextMode === 'previous'}
              color="rgba(245,158,11,0.8)"
              onClick={() => setMode('previous')}
            />
            <MenuRow
              label="No context"
              active={contextMode === 'none'}
              color="rgba(148,163,184,0.6)"
              onClick={() => setMode('none')}
            />
            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '3px 0' }} />
            <MenuRow label="Delete edge" color="rgba(248,113,113,0.8)" onClick={handleDelete} />
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

function MenuRow({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active?: boolean
  color: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '5px 12px',
        background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
        color: active ? color : 'rgba(255,255,255,0.55)',
        cursor: 'pointer',
        fontSize: 11,
        border: 'none',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'rgba(255,255,255,0.05)' : 'transparent' }}
    >
      {label}
    </button>
  )
}
