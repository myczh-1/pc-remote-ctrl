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
}: CommandPanelProps) {
  return (
    <div className="card rounded-2xl shadow-soft p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">命令集</h2>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 text-sm border border-black/10 dark:border-white/10 rounded-lg bg-white/50 dark:bg-card hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 text-slate-900 dark:text-slate-100"
            disabled={loading || isRunning}
            onClick={onRefresh}
            title="刷新命令集列表"
          >
            刷新
          </button>
        </div>
      </div>

      {commandSets.length === 0 && !loading ? (
        <div className="text-center py-10 text-slate-600 dark:text-slate-400">
          <h3 className="text-base font-medium text-slate-900 dark:text-slate-100">还没有命令集</h3>
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
