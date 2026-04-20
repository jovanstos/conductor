import { useState } from 'react'
import { GitPullRequest, X, Pencil, Check } from 'lucide-react'
import { useRunStore } from '../../stores/runStore'

export default function ReviewGateModal() {
  const { gateInfo, resumeGate } = useRunStore()
  const [feedback, setFeedback] = useState('')
  const [editContent, setEditContent] = useState(gateInfo?.output ?? '')
  const [tab, setTab] = useState<'review' | 'edit'>('review')

  if (!gateInfo) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[640px] max-h-[85vh] bg-[#141418] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/8">
          <div className="flex items-center gap-3 mb-1">
            <span className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400">
              <GitPullRequest size={14} />
            </span>
            <h2 className="text-base font-semibold text-white/85">Review Gate</h2>
          </div>
          <p className="text-sm text-white/45 ml-10">{gateInfo.message}</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/8">
          <TabBtn active={tab === 'review'} onClick={() => setTab('review')}>
            Current Output
          </TabBtn>
          <TabBtn active={tab === 'edit'} onClick={() => setTab('edit')}>
            Edit Output
          </TabBtn>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'review' ? (
            <pre className="text-sm text-white/65 whitespace-pre-wrap leading-relaxed font-mono bg-white/3 rounded-xl p-4 max-h-64 overflow-y-auto">
              {gateInfo.output || <span className="text-white/25">(no output)</span>}
            </pre>
          ) : (
            <textarea
              className="w-full h-64 bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white/75 font-mono outline-none focus:border-purple-500/40 resize-none"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
          )}

          {/* Feedback field (for reject) */}
          <div className="mt-4">
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
              Feedback (optional — used when rejecting)
            </p>
            <textarea
              className="w-full h-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/70 outline-none focus:border-purple-500/40 resize-none placeholder:text-white/20"
              placeholder="Describe what needs to change..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-white/8 flex items-center gap-3 justify-end">
          <button
            onClick={() => resumeGate('reject', feedback)}
            className="bg-white/6 hover:bg-white/10 border border-white/10 text-white/60 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <X size={13} className="inline mr-1" />Reject
          </button>
          {tab === 'edit' && (
            <button
              onClick={() => resumeGate('edit', editContent)}
              className="bg-blue-600/80 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              <Pencil size={13} className="inline mr-1" />Use edited output
            </button>
          )}
          <button
            onClick={() => resumeGate('approve')}
            className="bg-green-600/80 hover:bg-green-500 text-white text-sm px-5 py-2 rounded-lg transition-colors font-medium"
          >
            <Check size={13} className="inline mr-1" />Approve & Continue
          </button>
        </div>
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm transition-colors border-b-2 ${
        active
          ? 'border-purple-500 text-white/85'
          : 'border-transparent text-white/35 hover:text-white/60'
      }`}
    >
      {children}
    </button>
  )
}
