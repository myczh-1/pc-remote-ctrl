import type { CommandSet } from '../types'

interface WorkflowListProps {
  workflows: CommandSet[]
  onExecuteWorkflow: (commandSet: CommandSet) => void
  onEditWorkflow: (commandSet: CommandSet) => void
  onDeleteWorkflow: (id: string) => void
  onDuplicateWorkflow: (id: string) => void
  executingWorkflowId?: string
}

export function WorkflowList({ 
  workflows, 
  onExecuteWorkflow, 
  onEditWorkflow, 
  onDeleteWorkflow,
  onDuplicateWorkflow,
  executingWorkflowId 
}: WorkflowListProps) {
  if (workflows.length === 0) {
    return (
      <div className="text-center text-gray-600 py-6">
        <p className="text-sm">暂无命令集</p>
        <p className="text-sm">创建一个命令集来批量执行命令</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {workflows.map((commandSet) => {
        const isExecuting = executingWorkflowId === commandSet.commandId
        
        return (
          <div key={commandSet.commandId} className={`rounded-lg border bg-white p-4 shadow-sm ${isExecuting ? 'ring-2 ring-yellow-300' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900 truncate">{commandSet.commandName}</h3>
                  {isExecuting && <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5">执行中</span>}
                </div>
                {commandSet.description && (
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{commandSet.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                  <span>{commandSet.commandScripts?.length || 0} 个步骤</span>
                  <span>{commandSet.created.toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  className={`px-3 py-1.5 text-sm rounded-md ${isExecuting ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                  onClick={() => onExecuteWorkflow(commandSet)}
                  disabled={isExecuting}
                  title={isExecuting ? '命令集正在执行' : '执行命令集'}
                >
                  {isExecuting ? '执行中' : '执行'}
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50"
                  onClick={() => onEditWorkflow(commandSet)}
                  disabled={isExecuting}
                  title="编辑命令集"
                >
                  编辑
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50"
                  onClick={() => onDuplicateWorkflow(commandSet.commandId)}
                  disabled={isExecuting}
                  title="复制命令集"
                >
                  复制
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded-md border border-red-300 text-red-700 bg-white hover:bg-red-50"
                  onClick={() => onDeleteWorkflow(commandSet.commandId)}
                  disabled={isExecuting}
                  title="删除命令集"
                >
                  删除
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-sm text-gray-700 mb-1">
                <strong>执行步骤</strong>
                <span>{commandSet.commandScripts?.length || 0} 步</span>
              </div>
              <div className="space-y-1">
                {(commandSet.commandScripts || []).slice(0, 3).map((script, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 mt-0.5 w-4">{index + 1}</span>
                    <code className="text-sm text-gray-800 break-words">{script}</code>
                  </div>
                ))}
                {(commandSet.commandScripts?.length || 0) > 3 && (
                  <div className="text-sm text-gray-600">还有 {(commandSet.commandScripts?.length || 0) - 3} 个步骤</div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
