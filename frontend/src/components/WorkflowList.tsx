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
    <div style={{ display: 'grid', gap: '12px' }}>
      {workflows.map((commandSet) => {
        const isExecuting = executingWorkflowId === commandSet.commandId
        
        return (
          <div key={commandSet.commandId} style={{ 
            border: '1px solid #ddd', 
            borderRadius: '8px', 
            padding: '16px',
            backgroundColor: isExecuting ? '#f0f8ff' : 'transparent'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start',
              marginBottom: '8px' 
            }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>
                  {commandSet.commandName}
                  {isExecuting && <span style={{ color: '#007bff', marginLeft: '8px' }}>运行中...</span>}
                </h4>
                {commandSet.description && (
                  <p style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px' }}>
                    {commandSet.description}
                  </p>
                )}
                <div style={{ fontSize: '12px', color: '#999' }}>
                  {commandSet.commandScripts.length} 个步骤 · 创建于 {commandSet.created.toLocaleDateString()}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={() => onExecuteWorkflow(commandSet)}
                  disabled={isExecuting}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    backgroundColor: isExecuting ? '#ccc' : '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isExecuting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isExecuting ? '执行中' : '执行'}
                </button>
                
                <button
                  onClick={() => onEditWorkflow(commandSet)}
                  disabled={isExecuting}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    backgroundColor: 'transparent',
                    color: '#007bff',
                    border: '1px solid #007bff',
                    borderRadius: '4px',
                    cursor: isExecuting ? 'not-allowed' : 'pointer'
                  }}
                >
                  编辑
                </button>
                
                <button
                  onClick={() => onDuplicateWorkflow(commandSet.commandId)}
                  disabled={isExecuting}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    backgroundColor: 'transparent',
                    color: '#666',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: isExecuting ? 'not-allowed' : 'pointer'
                  }}
                >
                  复制
                </button>
                
                <button
                  onClick={() => onDeleteWorkflow(commandSet.commandId)}
                  disabled={isExecuting}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    backgroundColor: 'transparent',
                    color: '#dc3545',
                    border: '1px solid #dc3545',
                    borderRadius: '4px',
                    cursor: isExecuting ? 'not-allowed' : 'pointer'
                  }}
                >
                  删除
                </button>
              </div>
            </div>
            
            <div style={{ fontSize: '14px' }}>
              <strong>执行步骤:</strong>
              <ol style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                {commandSet.commandScripts.map((script, index) => (
                  <li key={index} style={{ marginBottom: '2px' }}>
                    <code style={{ fontSize: '12px', backgroundColor: '#f5f5f5', padding: '2px 4px', borderRadius: '2px' }}>
                      {script}
                    </code>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )
      })}
    </div>
  )
}