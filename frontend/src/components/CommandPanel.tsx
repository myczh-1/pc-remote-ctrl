import { WorkflowList } from './CommandSetList'
import type { CommandSet, CommandSetExecution } from '../types'

interface CommandPanelProps {
  commandSets: CommandSet[]
  loading: boolean
  isRunning: boolean
  execution: CommandSetExecution | null
  onRefresh: () => Promise<void>
  onCreate: () => void
  onExecute: (commandSet: CommandSet) => Promise<void>
  onEdit: (commandSet: CommandSet) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => Promise<void>
  onCreateSample: () => Promise<void>
}

export function CommandPanel({
  commandSets,
  loading,
  isRunning,
  execution,
  onRefresh,
  onCreate,
  onExecute,
  onEdit,
  onDelete,
  onDuplicate,
  onCreateSample,
}: CommandPanelProps) {
  return (
    <div className="card rounded-2xl shadow-soft p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-100">命令集</h2>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 text-sm border border-white/10 rounded-lg bg-card hover:bg-white/5 disabled:opacity-60 text-slate-100"
            disabled={loading || isRunning}
            onClick={onRefresh}
            title="刷新命令集列表"
          >
            刷新
          </button>
          <button
            className="px-3 py-2 text-sm rounded-lg bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 disabled:opacity-60 shadow-soft border border-prime-400/20"
            onClick={onCreate}
            disabled={isRunning}
          >
            新建命令集
          </button>
        </div>
      </div>

      {commandSets.length === 0 && !loading ? (
        <div className="text-center py-10 text-slate-400">
          <h3 className="text-base font-medium text-slate-100 mb-1">还没有命令集</h3>
          <p className="text-sm mb-4">创建第一个命令集来开始远程控制</p>
          <button 
            className="px-3 py-2 text-sm rounded-lg bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 disabled:opacity-60 shadow-soft border border-prime-400/20" 
            onClick={onCreateSample}
            disabled={loading || isRunning}
          >
            创建示例命令集
          </button>
        </div>
      ) : (
        <WorkflowList 
          workflows={commandSets}
          onExecuteWorkflow={onExecute}
          onEditWorkflow={onEdit}
          onDeleteWorkflow={onDelete}
          onDuplicateWorkflow={onDuplicate}
          executingWorkflowId={execution?.status === 'running' ? execution.commandSetId : undefined}
        />
      )}
    </div>
  )
}
