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
      <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
        <p>暂无命令集</p>
        <p>创建一个命令集来批量执行命令</p>
      </div>
    )
  }

  return (
    <div className="workflow-grid">
      {workflows.map((commandSet) => {
        const isExecuting = executingWorkflowId === commandSet.commandId
        
        return (
          <div 
            key={commandSet.commandId} 
            className={`workflow-card ${isExecuting ? 'executing' : ''} fade-in`}
          >
            <div className="workflow-header">
              <div className="workflow-info">
                <div className="workflow-title">
                  <h3>{commandSet.commandName}</h3>
                  {isExecuting && <span className="status-badge running">⚡ 执行中</span>}
                </div>
                {commandSet.description && (
                  <p className="workflow-description">{commandSet.description}</p>
                )}
                <div className="workflow-meta">
                  <span className="meta-item">📄 {commandSet.commandScripts.length} 个步骤</span>
                  <span className="meta-item">📅 {commandSet.created.toLocaleDateString()}</span>
                </div>
              </div>
              
              <div className="workflow-actions">
                <button
                  className={`btn btn-primary ${isExecuting ? 'btn-executing' : ''}`}
                  onClick={() => onExecuteWorkflow(commandSet)}
                  disabled={isExecuting}
                  title={isExecuting ? '命令集正在执行' : '执行命令集'}
                >
                  {isExecuting ? '🔄 执行中' : '▶️ 执行'}
                </button>
                
                <button
                  className="btn btn-outline"
                  onClick={() => onEditWorkflow(commandSet)}
                  disabled={isExecuting}
                  title="编辑命令集"
                >
                  ✏️ 编辑
                </button>
                
                <button
                  className="btn btn-outline"
                  onClick={() => onDuplicateWorkflow(commandSet.commandId)}
                  disabled={isExecuting}
                  title="复制命令集"
                >
                  📋 复制
                </button>
                
                <button
                  className="btn btn-danger"
                  onClick={() => onDeleteWorkflow(commandSet.commandId)}
                  disabled={isExecuting}
                  title="删除命令集"
                >
                  🗑️ 删除
                </button>
              </div>
            </div>
            
            <div className="workflow-steps">
              <div className="steps-header">
                <strong>📋 执行步骤</strong>
                <span className="steps-count">{commandSet.commandScripts.length} 步</span>
              </div>
              <div className="steps-list">
                {commandSet.commandScripts.slice(0, 3).map((script, index) => (
                  <div key={index} className="step-item">
                    <span className="step-number">{index + 1}</span>
                    <code className="step-command">{script}</code>
                  </div>
                ))}
                {commandSet.commandScripts.length > 3 && (
                  <div className="step-item more-steps">
                    <span className="step-number">...</span>
                    <span className="step-command">还有 {commandSet.commandScripts.length - 3} 个步骤</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}