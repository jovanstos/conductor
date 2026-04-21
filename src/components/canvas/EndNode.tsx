import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { StopCircle, Check } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'

export default memo(function EndNode(_: NodeProps) {
  const { currentRun } = useRunStore()
  const finalOutput = currentRun?.finalOutput
  const isDone = currentRun?.status === 'completed'

  return (
    <div className={`w-48 rounded-xl border shadow-lg transition-colors ${
      isDone ? 'border-indigo-400/60 bg-[#10101f]' : 'border-indigo-500/30 bg-[#10101a]'
    }`}>
      <Handle
        type="target"
        position={Position.Left}
        id="result"
        className="!bg-indigo-500/70 !border-indigo-500/40 !w-3 !h-3"
      />

      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-indigo-400 ${
            isDone ? 'bg-indigo-500/20' : 'bg-indigo-500/12'
          }`}>
            {isDone ? <Check size={14} className="text-indigo-300" /> : <StopCircle size={14} />}
          </div>
          <div>
            <p className="text-sm font-semibold text-white/85">End</p>
            <p className="text-xs text-indigo-400/60">
              {isDone ? 'Final result' : 'Final output'}
            </p>
          </div>
        </div>

        {finalOutput ? (
          <p className="text-xs text-white/50 line-clamp-3 leading-relaxed">{finalOutput}</p>
        ) : (
          <p className="text-xs text-white/25 italic">Worker result arrives here</p>
        )}
      </div>
    </div>
  )
})
