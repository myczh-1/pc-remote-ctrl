import { useMemo, useState } from 'react'
import { useCommandSets } from './hooks/useCommandSets'
import { useCommandSetExecution } from './hooks/useCommandSetExecution'
import { useLogger } from './hooks/useLogger'
import { LogDisplay } from './components/LogDisplay'
import { CommandPanel } from './components/CommandPanel'
import { ExecutionStatusPanel } from './components/ExecutionStatusPanel'
import { EditorModal } from './components/EditorModal'
import type { CommandSet } from './types'
import { useCloudApi } from './hooks/useCloudApi'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Console } from './components/Console'

export default function App() {
    // 默认使用本地模式，确保开箱即用的演示体验
    const [mode, setMode] = useState<'local'|'cloud'>('local')
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
    const { commandSets, loading, createCommandSet, updateCommandSet, deleteCommandSet, duplicateCommandSet, loadFromServer } = useCommandSets({ autoSync: mode === 'local' })
    const { log, logInfo, logError, logSuccess, clearLog, entries } = useLogger()
    const { execution, executeCommandSet, clearExecution, isRunning } = useCommandSetExecution()
    const cloud = useCloudApi()
    
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
        // 在云端模式下，刷新设备列表；本地模式刷新命令集
        if (mode === 'cloud') {
            const r = await cloud.refreshDevices()
            if (r.success) {
                logInfo(`云端设备: ${r.count} 台`)
            } else {
                logError(`刷新设备失败: ${r.error}`)
            }
            return
        }
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
        if (mode === 'local') {
            logInfo(`开始(本地)执行: ${commandSet.commandName}`)
            await executeCommandSet(commandSet)
            return
        }
        let targetId = selectedDeviceId
        if (!targetId) {
            // 自动选择第一个可用设备
            const first = cloud.devices[0]
            if (!first) {
                logError('云端模式需要先选择设备（当前无设备）')
                return
            }
            targetId = first.deviceId
            setSelectedDeviceId(targetId)
        }
        logInfo(`开始(云端)执行: ${commandSet.commandName} @ ${targetId}`)
        const r = await cloud.executeOnDevice(targetId, commandSet.commandId)
        if (!r.success) {
            logError(`云端执行失败: ${r.error}`)
            return
        }
        const resp = r.response!
        if (resp.stepResults?.length) {
            for (const s of resp.stepResults) {
                const tag = s.success ? '[OK]' : '[ERR]'
                logInfo(`${tag} [${s.stepIndex}] ${s.stepScript}\n${s.output || s.error || ''}`)
            }
        }
        if (resp.success) logSuccess('云端执行成功')
        else logError(`云端执行出错: ${resp.error}`)
    }

    // 一键演示：若无示例则创建；随后执行（依据当前模式）
    const handleRunDemo = async () => {
        // 尝试找到已存在的 demo 命令集
        let demo = commandSets.find(cs => cs.commandName === 'echo-demo')
        if (!demo) {
            const created = await createCommandSet({
                commandName: 'echo-demo',
                commandScripts: ['echo hello-from-demo'],
                description: 'demo sample generated'
            })
            if (!created.success || !created.commandSet) {
                logError(`创建示例命令集失败: ${created.message}`)
                return
            }
            demo = created.commandSet
            logSuccess('已创建示例命令集: echo-demo')
        }

        await handleExecuteCommandSet2(demo)
    }

    const sidebarDevices = mode === 'cloud'
      ? cloud.devices.map(d => ({ id: d.deviceId, name: d.name || d.deviceId, online: d.status === 'online' }))
      : [
          { id: 'local-1', name: '本地设备', online: true },
        ]

    const onlineCount = sidebarDevices.filter(d => d.online).length
    const queueCount = 0
    const failCount = 0

    const consoleLogs = entries.map(e => ({
      text: e.message,
      type: e.level === 'success' ? 'ok' : e.level === 'error' ? 'err' : 'info' as const,
      timestamp: e.timestamp,
    }))

    return (
      <div className="min-h-screen bg-bg text-slate-100 relative selection:bg-prime-400/20 selection:text-white overflow-hidden">
        <div className="absolute inset-0 bg-glow pointer-events-none overflow-hidden"></div>

        <div className="relative z-10 flex h-screen overflow-hidden">
          {mode === 'cloud' && (
            <Sidebar 
              devices={sidebarDevices}
              onAddDevice={() => { /* optional hook */ }}
            />
          )}

          <main className="flex-1 flex flex-col overflow-hidden">
            <Topbar 
              mode={mode}
              onModeChange={(m) => { setMode(m); if (m === 'cloud') { cloud.refreshDevices() } }}
              onlineCount={onlineCount}
              queueCount={queueCount}
              failCount={failCount}
              onRunAll={handleRunDemo}
              onSearch={() => { /* no-op */ }}
            />

            <ExecutionStatusPanel 
              execution={execution}
              onStop={() => {}}
              onClear={clearExecution}
            />

            <div className="p-4 md:p-6 flex-1 overflow-auto bg-bg">
              <div className="grid grid-cols-1 gap-6">
                <div className="card rounded-2xl shadow-soft p-4 border border-white/10 bg-card/80">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h1 className="text-lg font-semibold">PC 远程控制器</h1>
                      <p className="text-sm text-slate-400 mt-1">管理和执行远程命令（当前模式：{mode === 'local' ? '本地' : '云端'}）</p>
                      {mode === 'cloud' && (
                        <div className="text-xs text-slate-500 mt-1">Cloud: {cloud.baseUrl}</div>
                      )}
                    </div>
                    <button className="px-3 py-2 text-sm rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 disabled:opacity-60 shadow-soft border border-prime-400/20" onClick={handleRunDemo} disabled={isRunning}>
                      一键演示
                    </button>
                  </div>

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
                </div>
              </div>
            </div>

            <Console 
              logs={consoleLogs}
              onClear={clearLog}
              onCopy={() => {
                try { navigator.clipboard.writeText(entries.map(e => e.message).join('\n')) } catch {}
              }}
            />
          </main>
        </div>

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
