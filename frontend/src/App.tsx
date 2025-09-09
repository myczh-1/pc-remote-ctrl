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
    
    const [activeTab, setActiveTab] = useState<'list' | 'manage'>('list')
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
        <>
            <h1>gRPC-Web Controller</h1>

            {/* 标签页导航 */}
            <div style={{ 
                display: 'flex', 
                borderBottom: '2px solid #ddd', 
                marginBottom: '20px' 
            }}>
                <button
                    onClick={() => setActiveTab('list')}
                    style={{
                        padding: '12px 20px',
                        border: 'none',
                        backgroundColor: activeTab === 'list' ? '#007bff' : 'transparent',
                        color: activeTab === 'list' ? 'white' : '#007bff',
                        borderBottom: activeTab === 'list' ? '2px solid #007bff' : '2px solid transparent',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold'
                    }}
                >
                    命令集列表
                </button>
                <button
                    onClick={() => setActiveTab('manage')}
                    style={{
                        padding: '12px 20px',
                        border: 'none',
                        backgroundColor: activeTab === 'manage' ? '#007bff' : 'transparent',
                        color: activeTab === 'manage' ? 'white' : '#007bff',
                        borderBottom: activeTab === 'manage' ? '2px solid #007bff' : '2px solid transparent',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold'
                    }}
                >
                    命令集管理
                </button>
            </div>

            {/* 工作流执行状态 */}
            {execution && (
                <div style={{ marginBottom: '20px' }}>
                    <WorkflowExecutionStatus 
                        execution={execution}
                        onStop={() => {}}
                        onClear={clearExecution}
                    />
                </div>
            )}

            {/* 命令集列表标签页 */}
            {activeTab === 'list' && (
                <>
                    <div className="card" style={{ marginTop: 12 }}>
                        <h3>命令集列表</h3>
                        <CommandList 
                            commands={commandSets}
                            loading={loading || isRunning}
                            onExecuteCommand={handleExecuteCommandSet}
                        />
                    </div>
                </>
            )}

            {/* 命令集管理标签页 */}
            {activeTab === 'manage' && (
                <>
                    <div className="card" style={{ display: 'grid', gap: 8 }}>
                        <button disabled={loading || isRunning} onClick={handleStoreSample}>
                            ① Store sample "echo" command set
                        </button>
                        <button disabled={loading || isRunning} onClick={handleListAllCommandSets}>
                            ② List all command sets
                        </button>
                    </div>

                    <div className="card" style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: '16px'
                    }}>
                        <h3 style={{ margin: 0 }}>命令集管理</h3>
                        <button
                            onClick={handleCreateCommandSet}
                            disabled={isRunning}
                            style={{
                                padding: '10px 20px',
                                fontSize: '14px',
                                backgroundColor: isRunning ? '#ccc' : '#007bff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isRunning ? 'not-allowed' : 'pointer'
                            }}
                        >
                            + 创建命令集
                        </button>
                    </div>

                    <div className="card">
                        <WorkflowList 
                            workflows={commandSets}
                            onExecuteWorkflow={handleExecuteCommandSet2}
                            onEditWorkflow={handleEditCommandSet}
                            onDeleteWorkflow={handleDeleteCommandSet}
                            onDuplicateWorkflow={handleDuplicateCommandSet}
                            executingWorkflowId={execution?.commandSetId}
                        />
                    </div>
                </>
            )}

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

            <LogDisplay log={log} onClear={clearLog} />
        </>
    )
}