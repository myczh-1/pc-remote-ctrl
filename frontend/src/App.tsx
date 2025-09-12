import {useMemo, useState} from 'react'
import {useCommandSets} from './hooks/useCommandSets'
import {useCommandSetExecution} from './hooks/useCommandSetExecution'
import {useLogger} from './hooks/useLogger'
import {CommandPanel} from './components/CommandPanel'
import {ExecutionStatusPanel} from './components/ExecutionStatusPanel'
import {EditorModal} from './components/EditorModal'
import type {CommandSet} from './types'
import {useCloudApi} from './hooks/useCloudApi'
import {Sidebar, SidebarContent} from './components/Sidebar'
import { motion, useReducedMotion } from 'motion/react'
import {Topbar} from './components/Topbar'
import {Console} from './components/Console'
import { useMediaQuery } from './hooks/useMediaQuery'

export default function App() {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
            if (saved) return saved
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            return prefersDark ? 'dark' : 'light'
        }
        return 'dark'
    })
    // 默认使用本地模式，确保开箱即用的演示体验
    const [mode, setMode] = useState<'local' | 'cloud'>('local')
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
    const {
        commandSets,
        loading,
        createCommandSet,
        updateCommandSet,
        deleteCommandSet,
        duplicateCommandSet,
        loadFromServer
    } = useCommandSets({autoSync: mode === 'local'})
    const {logInfo, logError, logSuccess, clearLog, entries} = useLogger()
    const {execution, executeCommandSet, clearExecution, isRunning} = useCommandSetExecution()
    const cloud = useCloudApi()
    const prefersReduced = useReducedMotion()
    const isUltraWide = useMediaQuery('(min-width: 1920px)')
    const isDesktopXL = useMediaQuery('(min-width: 1280px)')
    const isWideLocal = isUltraWide && mode === 'local'
    const layoutTransition = useMemo(() => (
        prefersReduced ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as any }
    ), [prefersReduced])
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
    const [mobileSidebarFull, setMobileSidebarFull] = useState(false)
    const [mobileInlineExpanded, setMobileInlineExpanded] = useState(false)

    const [showCommandSetEditor, setShowCommandSetEditor] = useState(false)
    const [editingCommandSet, setEditingCommandSet] = useState<CommandSet | undefined>()

    // removed sample creation button and related logic

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

    const sidebarDevices = mode === 'cloud'
        ? cloud.devices.map(d => ({id: d.deviceId, name: d.name || d.deviceId, online: d.status === 'online'}))
        : []

    const consoleLogs = entries.map(e => ({
        text: e.message,
        type: e.level === 'success' ? 'ok' : e.level === 'error' ? 'err' : 'info' as const,
        timestamp: e.timestamp,
    }))

    // Apply theme class to <html>
    if (typeof document !== 'undefined') {
        const root = document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
    }

    return (
        <div
            className="min-h-screen bg-white text-slate-900 dark:bg-surface dark:text-slate-100 relative selection:bg-prime-400/20 selection:text-white overflow-hidden">
            <div className="absolute inset-0 bg-glow pointer-events-none overflow-hidden"></div>

            <div className="relative z-10 flex h-screen overflow-hidden">

                <Sidebar
                    isOpen={isDesktopXL ? (mode === 'cloud') : false}
                    devices={sidebarDevices}
                    onAddDevice={() => { /* optional hook */ }}
                    onClose={() => { setMobileDrawerOpen(false); setMobileSidebarFull(false) }}
                    mobileFullWidth={false}
                    onToggleMode={() => {
                        setMode(m => {
                            const next = m === 'local' ? 'cloud' : 'local'
                            if (next === 'cloud') {
                                cloud.refreshDevices()
                            }
                            if (!isDesktopXL) { setMobileDrawerOpen(false); setMobileSidebarFull(false); setMobileInlineExpanded(false) }
                            return next
                        })
                    }}
                />


                <motion.main layout className="flex-1 flex flex-col overflow-hidden">
                    <Topbar
                        mode={mode}
                        theme={theme}
                        onToggleMode={() => {
                            setMode(m => {
                                const next = m === 'local' ? 'cloud' : 'local'
                                if (next === 'cloud') {
                                    cloud.refreshDevices()
                                }
                                // 切换模式时关闭移动端内联侧栏
                                setMobileDrawerOpen(false)
                                setMobileSidebarFull(false)
                                setMobileInlineExpanded(false)
                                return next
                            })
                        }}
                        onToggleTheme={() => {
                            setTheme(t => {
                                const next = t === 'dark' ? 'light' : 'dark'
                                try {
                                    localStorage.setItem('theme', next)
                                } catch {
                                }
                                return next
                            })
                        }}
                        onCreate={handleCreateCommandSet}
                    />

                    <ExecutionStatusPanel
                        execution={execution}
                        onStop={() => {
                        }}
                        onClear={clearExecution}
                    />

                    {/* 主工作区：命令集 与 控制台 上下/左右切换（≥1920 且本地模式为左右） */}
                    <div className={`p-4 md:p-6 flex-1 overflow-hidden bg-white dark:bg-surface`}>
                        <div className="h-full min-h-0 flex gap-4">
                            {/* 移动端云端模式：左侧显示窄栏（设备图标 + 统计），点击统计打开抽屉 */}
                            {!isDesktopXL && mode === 'cloud' && (
                                <motion.div
                                    layout
                                    initial={false}
                                    animate={{ width: mobileInlineExpanded ? '100%' as any : 56 }}
                                    transition={layoutTransition}
                                    className="flex-none overflow-hidden bg-white dark:bg-surface-soft border-r border-black/10 dark:border-white/10 glass"
                                    style={{ borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}
                                >
                                    {mobileInlineExpanded ? (
                                        <div className="h-full flex flex-col relative">
                                            <button
                                                className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                                                onClick={() => setMobileInlineExpanded(false)}
                                                aria-label="关闭侧栏"
                                            >✕</button>
                                            <SidebarContent
                                                devices={sidebarDevices}
                                                onAddDevice={() => {}}
                                                onClose={() => setMobileInlineExpanded(false)}
                                                showHeader={false}
                                            />
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center py-3 gap-3">
                                            {sidebarDevices.some(d=>d.online) && (
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-prime-400/70 to-indigo-400/70 grid place-items-center shadow-soft">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/>
                                                    </svg>
                                                </div>
                                            )}
                                            <button
                                                onClick={() => setMobileInlineExpanded(true)}
                                                className="mt-auto card rounded-xl p-2 text-center text-[11px] text-slate-400"
                                                title="查看设备详情"
                                            >
                                                <div>在线</div>
                                                <div className="font-semibold text-slate-800 dark:text-slate-100">{sidebarDevices.filter(d=>d.online).length}</div>
                                                <div className="mt-1">离线</div>
                                                <div className="font-semibold text-slate-800 dark:text-slate-100">{sidebarDevices.filter(d=>!d.online).length}</div>
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {!mobileInlineExpanded && (
                            <motion.section
                                layout
                                transition={layoutTransition}
                                className={`flex gap-6 h-full min-h-0 flex-1 min-w-0 ${isWideLocal ? 'flex-row items-stretch' : 'flex-col'} `}
                            >
                            <motion.div
                                layout
                                transition={layoutTransition}
                                className={`flex-1 min-h-0 overflow-auto ${isWideLocal ? 'flex-[2] min-w-0' : ''}`}
                            >
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
                                />
                            </motion.div>

                            <motion.div layout transition={layoutTransition} className={`${isWideLocal ? 'flex-[1] min-w-[360px] min-h-0 flex flex-col' : ''}`}>
                                <Console
                                    logs={consoleLogs}
                                    fullHeight={isWideLocal}
                                    onClear={clearLog}
                                    onCopy={() => {
                                        try {
                                            navigator.clipboard.writeText(entries.map(e => e.message).join('\n'))
                                        } catch {
                                        }
                                    }}
                                />
                            </motion.div>
                            </motion.section>
                            )}
                        </div>
                    </div>
                </motion.main>
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
