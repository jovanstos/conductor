import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useRunStore } from '../../stores/runStore'

export default memo(function EndNode({ id }: NodeProps) {
  const { currentRun } = useRunStore()
  const finalOutput = currentRun?.finalOutput

  return (
    <div className="w-44 rounded-xl border-2 border-indigo-500/40 bg-[#10101a] shadow-lg">
      {/* Input only — left side */}
      <Handle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        className="!bg-indigo-500/60 !border-indigo-500/30 !w-3 !h-3"
      />

      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-base shrink-0 text-indigo-400">
            ■
          </div>
          <div>
            <p className="text-sm font-semibold text-white/85">End</p>
            <p className="text-[11px] text-indigo-400/60">Final output</p>
          </div>
        </div>
        {finalOutput ? (
          <p className="text-[10px] text-white/40 line-clamp-2 leading-relaxed">{finalOutput}</p>
        ) : (
          <p className="text-[10px] text-white/20 italic">Output appears here</p>
        )}
      </div>
    </div>
  )
})
