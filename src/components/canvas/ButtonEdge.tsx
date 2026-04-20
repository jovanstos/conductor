import { getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { X } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflowStore'

export default function ButtonEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  selected,
}: EdgeProps) {
  const { deleteElements } = useReactFlow()
  const { removeEdge } = useWorkflowStore()
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    deleteElements({ edges: [{ id }] })
    removeEdge(id)
  }

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{ ...style, strokeWidth: selected ? 2.5 : 2 }}
      />
      {/* Wider invisible hit area so the edge is easier to click/select */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        className="react-flow__edge-interaction"
      />
      <foreignObject x={labelX - 9} y={labelY - 9} width={18} height={18} className="overflow-visible">
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
            opacity: selected ? 1 : 0,
            transition: 'opacity 0.15s, color 0.15s, border-color 0.15s',
            padding: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget
            el.style.color = '#f87171'
            el.style.borderColor = 'rgba(239,68,68,0.5)'
            el.style.background = '#221a1a'
            el.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget
            el.style.color = 'rgba(255,255,255,0.35)'
            el.style.borderColor = 'rgba(255,255,255,0.2)'
            el.style.background = '#1a1a22'
            el.style.opacity = selected ? '1' : '0'
          }}
        >
          <X size={9} strokeWidth={2.5} />
        </button>
      </foreignObject>
    </>
  )
}
