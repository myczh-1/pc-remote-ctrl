import './App.css'
import { useState } from 'react'
import { useCommandSets } from './hooks/useCommandSets'
import { useCommandSetExecution } from './hooks/useCommandSetExecution'
import { useLogger } from './hooks/useLogger'
import { LogDisplay } from './components/LogDisplay'
import { CommandPanel } from './components/CommandPanel'
import { ExecutionStatusPanel } from './components/ExecutionStatusPanel'
import { EditorModal } from './components/EditorModal'
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
            const result = await updateCommandSet(editingCommandSet.commandId, commandSetData)
            if (result.success) {
                logSuccess(`命令集 "${commandSetData.commandName}" 已更新`)
            } else {
                logError(`更新命令集失败: ${result.message}`)
                return
            }
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

    const handleDeleteCommandSet = async (id: string) => {
        const commandSet = commandSets.find(cs => cs.commandId === id)
        if (commandSet && confirm(`确定要删除命令集 "${commandSet.commandName}" 吗？`)) {
            const result = await deleteCommandSet(id)
            if (result.success) {
                logSuccess(`命令集 "${commandSet.commandName}" 已删除`)
            } else {
                logError(`删除命令集失败: ${result.message}`)
            }
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

            <ExecutionStatusPanel 
                execution={execution}
                onStop={() => {}}
                onClear={clearExecution}
            />

            <main className="main-content">
                <CommandPanel
                    commandSets={commandSets}
                    loading={loading}
                    isRunning={isRunning}
                    execution={execution}
                    onRefresh={handleListAllCommandSets}
                    onCreate={handleCreateCommandSet}
                    onExecute={handleExecuteCommandSet2}
                    onEdit={handleEditCommandSet}
                    onDelete={handleDeleteCommandSet}
                    onDuplicate={handleDuplicateCommandSet}
                    onCreateSample={handleStoreSample}
                />

                <div className="log-panel">
                    <LogDisplay log={log} onClear={clearLog} />
                </div>
            </main>

            <EditorModal
                isVisible={showCommandSetEditor}
                editingCommandSet={editingCommandSet}
                availableCommands={commandSets}
                onSave={handleSaveCommandSet}
                onCancel={() => {
                    setShowCommandSetEditor(false)
                    setEditingCommandSet(undefined)
                }}
            />
        </div>
    )
}