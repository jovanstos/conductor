import { useEffect } from 'react'
import { listenToRun } from '../lib/tauri'
import { useRunStore } from '../stores/runStore'

export function useRun(runId: string | null | undefined) {
  const {
    _addStep,
    _updateStep,
    _appendStepOutput,
    _addLog,
    _setGateInfo,
    _setFinalOutput,
    _setRunStatus,
    _addToolCall,
    _updateToolCall,
    _setToolConfirmRequest,
  } = useRunStore()

  useEffect(() => {
    if (!runId) return

    let cleanup: (() => void) | null = null

    listenToRun(runId, {
      onStepStarted: (p) => {
        _addStep({ nodeId: p.nodeId, nodeName: p.nodeName, attempt: p.attempt, status: 'running' })
        _addLog(`[${p.nodeName}] → Starting (attempt ${p.attempt})...`)
      },
      onStepChunk: (p) => {
        _appendStepOutput(p.nodeId, p.chunk)
      },
      onStepDone: (p) => {
        _updateStep(p.nodeId, {
          status: 'done',
          output: p.output,
          completedAt: new Date().toISOString(),
          tokensUsed: p.tokensUsed,
          filesWritten: p.filesWritten ?? [],
        })
        const fileNote = p.filesWritten?.length ? ` (${p.filesWritten.length} file${p.filesWritten.length !== 1 ? 's' : ''} written)` : ''
        _addLog(`[step] → Done.${fileNote}`)
      },
      onStepError: (p) => {
        _updateStep(p.nodeId, { status: 'error', error: p.error, completedAt: new Date().toISOString() })
        _addLog(`[error] → ${p.error}`)
        _setRunStatus('failed')
      },
      onGatePaused: (p) => {
        _setGateInfo(p)
        _setRunStatus('paused')
        _addLog(`[gate] → Paused for review.`)
      },
      onCompleted: (p) => {
        _setFinalOutput(p.finalOutput)
        _addLog(`[done] → Workflow completed.`)
      },
      onCancelled: () => {
        _setRunStatus('cancelled')
        _addLog(`[cancelled] → Run cancelled.`)
      },
      onToolCallStarted: (p) => {
        _addToolCall(p.nodeId, {
          toolCallId: p.toolCallId,
          toolName: p.toolName,
          argsPreview: p.argsPreview,
          status: 'running',
        })
        _addLog(`[tool] → ${p.toolName}(${p.argsPreview})`)
      },
      onToolCallDone: (p) => {
        _updateToolCall(p.nodeId, p.toolCallId, {
          status: p.isError ? 'error' : 'done',
          resultPreview: p.resultPreview,
          isError: p.isError,
        })
      },
      onToolConfirmRequest: (p) => {
        _setToolConfirmRequest(p)
      },
    }).then((unlisten) => {
      cleanup = unlisten
    })

    return () => {
      cleanup?.()
    }
  }, [runId, _addStep, _updateStep, _appendStepOutput, _addLog, _setGateInfo, _setFinalOutput, _setRunStatus, _addToolCall, _updateToolCall, _setToolConfirmRequest])
}
