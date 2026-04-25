import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { StopCircle, Check } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'

export default memo(function EndNode(_: NodeProps) {
  const { currentRun } = useRunStore()
  const finalOutput = currentRun?.finalOutput
  const isDone = currentRun?.status === 'completed'

  return (
    <div
      className="w-48 rounded-2xl shadow-md transition-all"
      style={{
        background: 'var(--c-surface)',
        border: `1px solid ${isDone ? 'rgba(129,140,248,0.55)' : 'rgba(129,140,248,0.25)'}`,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="result"
        className="!bg-indigo-500/70 !border-indigo-500/40 !w-3 !h-3"
      />

      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isDone ? 'bg-indigo-500/20' : 'bg-indigo-500/10'}`}>
            {isDone
              ? <Check size={13} className="text-indigo-300" />
              : <StopCircle size={13} className="text-indigo-400" />
            }
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>End</p>
            <p className="text-xs text-indigo-400/60">{isDone ? 'Final result' : 'Final output'}</p>
          </div>
        </div>

        {finalOutput ? (
          <p className="text-xs line-clamp-3 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>{finalOutput}</p>
        ) : (
          <p className="text-xs italic" style={{ color: 'var(--c-text-dim)' }}>Result arrives here</p>
        )}
      </div>
    </div>
  )
})
