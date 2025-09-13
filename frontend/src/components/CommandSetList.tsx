import { motion } from 'motion/react'
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
      <div className="text-center text-slate-400 py-6">
        <p className="text-sm">暂无命令集</p>
        <p className="text-sm">创建一个命令集来批量执行命令</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {workflows.map((commandSet, index) => {
        const isExecuting = executingWorkflowId === commandSet.commandId
        
        return (
          <motion.div 
            key={commandSet.commandId} 
            className={`card rounded-2xl p-4 card-hover ${isExecuting ? 'ring-2 ring-yellow-400/50' : ''}`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
              duration: 0.4,
              delay: index * 0.1,
              ease: [0.25, 0.46, 0.45, 0.94]
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{commandSet.commandName}</h3>
                  {isExecuting && <span className="inline-flex items-center rounded-full bg-yellow-500/20 text-yellow-300 text-xs px-2 py-0.5 border border-yellow-400/30">执行中</span>}
                </div>
                {commandSet.description && (
                  <p className="text-sm text-slate-400 mt-1 line-clamp-2">{commandSet.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                  <span>{commandSet.commandScripts?.length || 0} 个步骤</span>
                  <span>{commandSet.created.toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  className={`px-3 py-1.5 text-sm rounded-lg ${isExecuting ? 'bg-slate-700 text-slate-400' : 'bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 shadow-soft border border-prime-400/20'}`}
                  onClick={() => onExecuteWorkflow(commandSet)}
                  disabled={isExecuting}
                  title={isExecuting ? '命令集正在执行' : '执行命令集'}
                >
                  {isExecuting ? '执行中' : '执行'}
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-card hover:bg-black/5 dark:hover:bg-white/5 text-slate-900 dark:text-slate-100"
                  onClick={() => onEditWorkflow(commandSet)}
                  disabled={isExecuting}
                  title="编辑命令集"
                >
                  编辑
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-card hover:bg-black/5 dark:hover:bg-white/5 text-slate-900 dark:text-slate-100"
                  onClick={() => onDuplicateWorkflow(commandSet.commandId)}
                  disabled={isExecuting}
                  title="复制命令集"
                >
                  复制
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded-lg border border-red-400/30 text-white bg-red-500 hover:bg-red-500"
                  onClick={() => onDeleteWorkflow(commandSet.commandId)}
                  disabled={isExecuting}
                  title="删除命令集"
                >
                  删除
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300 mb-1">
                <strong>执行步骤</strong>
                <span>{commandSet.commandScripts?.length || 0} 步</span>
              </div>
              <div className="space-y-1">
                {(commandSet.commandScripts || []).slice(0, 3).map((script, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-xs text-slate-500 mt-0.5 w-4">{index + 1}</span>
                    <code className="text-sm break-words bg-black/5 dark:bg-slate-800/30 text-slate-900 dark:text-slate-200 px-1 rounded">{script}</code>
                  </div>
                ))}
                {(commandSet.commandScripts?.length || 0) > 3 && (
                  <div className="text-sm text-slate-600 dark:text-slate-400">还有 {(commandSet.commandScripts?.length || 0) - 3} 个步骤</div>
                )}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
