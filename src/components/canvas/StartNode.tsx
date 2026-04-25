import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'

export default memo(function StartNode(_: NodeProps) {
  const { currentRun } = useRunStore()
  const input = currentRun?.input

  return (
    <div
      className="w-48 rounded-2xl shadow-md transition-colors"
      style={{
        background: 'var(--c-surface)',
        border: '1px solid rgba(52,211,153,0.35)',
      }}
    >
      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Play size={13} className="text-emerald-400" fill="currentColor" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>Start</p>
            <p className="text-xs text-emerald-500/70">Workflow input</p>
          </div>
        </div>

        {input ? (
          <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>{input}</p>
        ) : (
          <p className="text-xs italic" style={{ color: 'var(--c-text-dim)' }}>Task appears here on run…</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="task"
        className="!bg-emerald-500/70 !border-emerald-500/40 !w-3 !h-3"
      />
    </div>
  )
})
