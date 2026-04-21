import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'

export default memo(function StartNode(_: NodeProps) {
  const { currentRun } = useRunStore()
  const input = currentRun?.input

  return (
    <div className="w-48 rounded-xl border border-emerald-500/40 bg-[#0f1a14] shadow-lg">
      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
            <Play size={14} fill="currentColor" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/85">Start</p>
            <p className="text-xs text-emerald-400/60">Workflow input</p>
          </div>
        </div>

        {input ? (
          <p className="text-xs text-white/45 line-clamp-2 leading-relaxed">{input}</p>
        ) : (
          <p className="text-xs text-white/25 italic">Task appears here on run…</p>
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
