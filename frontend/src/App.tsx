import './App.css'
import { useState } from 'react'
import { useCommandSets } from './hooks/useCommandSets'
import { useCommandSetExecution } from './hooks/useCommandSetExecution'
import { useLogger } from './hooks/useLogger'
import { CommandList } from './components/CommandList'
import { LogDisplay } from './components/LogDisplay'
import { WorkflowList } from './components/WorkflowList'
import { WorkflowEditor } from './components/WorkflowEditor'
import { WorkflowExecutionStatus } from './components/WorkflowExecutionStatus'
import type { CommandSet } from './types'

export default function App() {
    const { commandSets, loading, createCommandSet, updateCommandSet, deleteCommandSet, duplicateCommandSet, loadFromServer } = useCommandSets()
    const { log, logInfo, logError, logSuccess, clearLog } = useLogger()
    const { execution, executeCommandSet, clearExecution, isRunning } = useCommandSetExecution()
    
    const [showCommandSetEditor, setShowCommandSetEditor] = useState(false)
    const [editingCommandSet, setEditingCommandSet] = useState<CommandSet | undefined>()

    const handleStoreSample = async () => {
        const result = await createCommandSet({
            commandName: 'echo-demo',
            commandScripts: ['echo hello-from-protobuf-ts'],
            description: 'stored from web',
        })
        
        if (result.success) {
            logSuccess(`StoreCommandSet: ${result.message}`)
        } else {
            logError(`StoreCommandSet ERROR: ${result.message}`)
        }
    }

    const handleListAllCommandSets = async () => {
        const result = await loadFromServer()
        
        if (result.success) {
            logInfo(`GetAllCommandSets: ${result.commandSets.length} items`)
        } else {
            logError('GetAllCommandSets ERROR: Failed to fetch command sets')
        }
    }

    const handleExecuteCommandSet = async (commandSetId: string) => {
        const commandSet = commandSets.find(cs => cs.commandId === commandSetId)
        if (!commandSet) {
            logError(`CommandSet not found: ${commandSetId}`)
            return
        }
        
        const result = await executeCommandSet(commandSet)
        
        if (result?.success) {
            logSuccess(`ExecuteCommandSet(${commandSetId}): Successfully executed ${result.stepResults.length} steps`)
        } else {
            logError(`ExecuteCommandSet(${commandSetId}) ERROR: ${result?.error}`)
        }
    }

    const handleCreateCommandSet = () => {
        setEditingCommandSet(undefined)
        setShowCommandSetEditor(true)
    }

    const handleEditCommandSet = (commandSet: CommandSet) => {
        setEditingCommandSet(commandSet)
        setShowCommandSetEditor(true)
    }

    const handleSaveCommandSet = async (commandSetData: Omit<CommandSet, 'commandId' | 'created'>) => {
        if (editingCommandSet) {
            updateCommandSet(editingCommandSet.commandId, commandSetData)
            logInfo(`命令集 "${commandSetData.commandName}" 已更新`)
        } else {
            const result = await createCommandSet(commandSetData)
            if (result.success) {
                logInfo(`命令集 "${commandSetData.commandName}" 已创建`)
            } else {
                logError(`创建命令集失败: ${result.message}`)
                return
            }
        }
        setShowCommandSetEditor(false)
        setEditingCommandSet(undefined)
    }

    const handleDeleteCommandSet = (id: string) => {
        const commandSet = commandSets.find(cs => cs.commandId === id)
        if (commandSet && confirm(`确定要删除命令集 "${commandSet.commandName}" 吗？`)) {
            deleteCommandSet(id)
            logInfo(`命令集 "${commandSet.commandName}" 已删除`)
        }
    }

    const handleDuplicateCommandSet = async (id: string) => {
        const duplicated = await duplicateCommandSet(id)
        if (duplicated?.success && duplicated.commandSet) {
            logInfo(`命令集 "${duplicated.commandSet.commandName}" 已创建`)
        }
    }

    const handleExecuteCommandSet2 = async (commandSet: CommandSet) => {
        logInfo(`开始执行命令集: ${commandSet.commandName}`)
        await executeCommandSet(commandSet)
    }

    return (
        <div className="app-container">
            <header className="app-header">
                <h1>PC 远程控制器</h1>
                <p>管理和执行远程命令</p>
            </header>

            {/* 工作流执行状态 */}
            {execution && (
                <div className="execution-status">
                    <WorkflowExecutionStatus 
                        execution={execution}
                        onStop={() => {}}
                        onClear={clearExecution}
                    />
                </div>
            )}

            <main className="main-content">
                {/* 主要控制面板 */}
                <div className="control-panel">
                    <div className="panel-header">
                        <h2>命令集</h2>
                        <div className="header-actions">
                            <button
                                className="btn btn-secondary"
                                disabled={loading || isRunning}
                                onClick={handleListAllCommandSets}
                                title="刷新命令集列表"
                            >
                                🔄 刷新
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCreateCommandSet}
                                disabled={isRunning}
                            >
                                ➕ 新建命令集
                            </button>
                        </div>
                    </div>

                    {commandSets.length === 0 && !loading ? (
                        <div className="empty-state">
                            <div className="empty-icon">📝</div>
                            <h3>还没有命令集</h3>
                            <p>创建第一个命令集来开始远程控制</p>
                            <button 
                                className="btn btn-primary" 
                                onClick={handleStoreSample}
                                disabled={loading || isRunning}
                            >
                                创建示例命令集
                            </button>
                        </div>
                    ) : (
                        <WorkflowList 
                            workflows={commandSets}
                            onExecuteWorkflow={handleExecuteCommandSet2}
                            onEditWorkflow={handleEditCommandSet}
                            onDeleteWorkflow={handleDeleteCommandSet}
                            onDuplicateWorkflow={handleDuplicateCommandSet}
                            executingWorkflowId={execution?.commandSetId}
                        />
                    )}
                </div>

                {/* 日志面板 */}
                <div className="log-panel">
                    <LogDisplay log={log} onClear={clearLog} />
                </div>
            </main>

            {/* 命令集编辑器模态框 */}
            {showCommandSetEditor && (
                <WorkflowEditor 
                    workflow={editingCommandSet}
                    availableCommands={commandSets}
                    onSave={handleSaveCommandSet}
                    onCancel={() => {
                        setShowCommandSetEditor(false)
                        setEditingCommandSet(undefined)
                    }}
                />
            )}
        </div>
    )
}