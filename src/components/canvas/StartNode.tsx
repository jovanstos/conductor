import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useRunStore } from '../../stores/runStore'

export default memo(function StartNode({ id }: NodeProps) {
  const { currentRun } = useRunStore()
  const input = currentRun?.input

  return (
    <div className="w-44 rounded-xl border-2 border-emerald-500/50 bg-[#0f1a14] shadow-lg">
      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-base shrink-0 text-emerald-400">
            ▶
          </div>
          <div>
            <p className="text-sm font-semibold text-white/85">Start</p>
            <p className="text-[11px] text-emerald-400/60">Task input</p>
          </div>
        </div>
        {input ? (
          <p className="text-[10px] text-white/40 line-clamp-2 leading-relaxed">{input}</p>
        ) : (
          <p className="text-[10px] text-white/20 italic">Waiting for task…</p>
        )}
      </div>

      {/* Output only — right side */}
      <Handle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!bg-emerald-500/60 !border-emerald-500/30 !w-3 !h-3"
      />
    </div>
  )
})
