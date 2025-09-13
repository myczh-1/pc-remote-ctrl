import {useMemo, useState} from 'react'
import {useCommandSets} from './hooks/useCommandSets'
import {useCommandSetExecution} from './hooks/useCommandSetExecution'
import {useLogger} from './hooks/useLogger'
import {CommandPanel} from './components/CommandPanel'
import {EditorModal} from './components/EditorModal'
import type {CommandSet} from './types'
import {useCloudApi} from './hooks/useCloudApi'
import {Sidebar, SidebarContent} from './components/Sidebar'
import { motion, useReducedMotion } from 'motion/react'
import {Topbar} from './components/Topbar'
import {Console} from './components/Console'
import { useMediaQuery } from './hooks/useMediaQuery'
import {CloudConfigModal} from './components/CloudConfigModal'

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
        loadFromServer,
        clearCommandSets,
        setCommandSetsDirectly
    } = useCommandSets({autoSync: mode === 'local'})
    const {logInfo, logError, logSuccess, clearLog, entries} = useLogger()
    const {execution, executeCommandSet, clearExecution, stopExecution, isRunning} = useCommandSetExecution()
    const cloud = useCloudApi()
    const cloudStatus = {
        connectionStatus: cloud.connectionStatus,
        lastError: cloud.lastError,
        lastRefreshTime: cloud.lastRefreshTime,
        loading: cloud.loadingDevices
    }
    const prefersReduced = useReducedMotion()
    const isUltraWide = useMediaQuery('(min-width: 1920px)')
    const isDesktopXL = useMediaQuery('(min-width: 1280px)')
    const isWideLocal = isUltraWide && mode === 'local'
    const layoutTransition = useMemo(() => (
        prefersReduced ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as any }
    ), [prefersReduced])
    const [_mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
    const [_mobileSidebarFull, setMobileSidebarFull] = useState(false)
    const [mobileInlineExpanded, setMobileInlineExpanded] = useState(false)

    const [showCommandSetEditor, setShowCommandSetEditor] = useState(false)
    const [editingCommandSet, setEditingCommandSet] = useState<CommandSet | undefined>()
    const [showCloudConfig, setShowCloudConfig] = useState(false)

    // removed sample creation button and related logic

    const handleListAllCommandSets = async () => {
        // 在云端模式下，刷新设备列表并获取选中设备的命令集；本地模式刷新命令集
        if (mode === 'cloud') {
            const r = await cloud.refreshDevices()
            if (r.success) {
                logInfo(`云端设备: ${r.count} 台`)

                // 如果有选中的设备，获取其命令集
                if (selectedDeviceId) {
                    await loadCommandSetsForDevice(selectedDeviceId)
                } else {
                    logInfo('请先选择一个设备查看其命令集')
                }
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

    const handleConfigCloud = () => {
        setShowCloudConfig(true)
    }

    const handleSaveCloudConfig = (config: { baseUrl: string }) => {
        // 保存到localStorage
        localStorage.setItem('cloud-config', JSON.stringify(config))
        // 更新useCloudApi的配置
        cloud.updateConfig(config)
        setShowCloudConfig(false)
        logInfo(`云端服务器地址已更新: ${config.baseUrl}`)
        // 刷新设备列表
        setTimeout(() => cloud.refreshDevices(), 100)
    }

    const handleSelectDevice = async (deviceId: string) => {
        const prevDeviceId = selectedDeviceId
        setSelectedDeviceId(deviceId)

        // 只有在设备真正改变时才加载命令集
        if (mode === 'cloud' && deviceId && deviceId !== prevDeviceId) {
            await loadCommandSetsForDevice(deviceId)
        }
    }

    // 提取命令集加载逻辑，避免重复代码
    const loadCommandSetsForDevice = async (deviceId: string) => {
        const cmdResult = await cloud.getCommandSetsFromDevice(deviceId)
        if (cmdResult.success && cmdResult.response?.commandSets) {
            // 直接设置从云端获取的命令集，避免重复的服务器调用和渲染
            const cloudCommandSets: CommandSet[] = cmdResult.response.commandSets.map(cs => ({
                commandId: cs.commandSetId || crypto.randomUUID(),
                commandName: cs.commandSetName || '',
                commandScripts: cs.commandScripts || [],
                description: cs.description || '',
                isComposite: false,
                created: new Date()
            }))

            // 直接设置状态，一次性完成
            setCommandSetsDirectly(cloudCommandSets)
            logInfo(`已加载设备 ${deviceId} 的命令集: ${cloudCommandSets.length} 个`)
        } else {
            clearCommandSets()
            logError(`获取设备 ${deviceId} 的命令集失败: ${cmdResult.error || '未知错误'}`)
        }
    }

    const handleExecuteCommandSet2 = async (commandSet: CommandSet) => {
        if (mode === 'local') {
            // 记录执行开始
            logInfo(`开始(本地)执行: ${commandSet.commandName}`, 'execution_start', {
                commandSetName: commandSet.commandName
            })
            
            const result = await executeCommandSet(commandSet)
            
            // 记录每个步骤的执行结果
            if (result && execution?.stepResults) {
                execution.stepResults.forEach((step) => {
                    logInfo('', 'execution_step', {
                        stepIndex: step.stepIndex,
                        stepScript: step.stepScript,
                        output: step.output,
                        error: step.error,
                        exitCode: step.exitCode,
                        success: step.success
                    })
                })
            }
            
            // 记录执行完成或失败
            if (result?.success) {
                const duration = execution?.startTime ? 
                    Math.floor((new Date().getTime() - execution.startTime.getTime()) / 1000) + 's' : ''
                logSuccess('', 'execution_complete', {
                    commandSetName: commandSet.commandName,
                    duration
                })
            } else {
                logError(result?.error || '执行失败', 'execution_error', {
                    commandSetName: commandSet.commandName
                })
            }
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
        
        logInfo(`开始(云端)执行: ${commandSet.commandName} @ ${targetId}`, 'execution_start', {
            commandSetName: commandSet.commandName
        })
        
        const r = await cloud.executeOnDevice(targetId, commandSet.commandId)
        if (!r.success) {
            logError(`云端执行失败: ${r.error}`, 'execution_error', {
                commandSetName: commandSet.commandName
            })
            return
        }
        
        const resp = r.response!
        if (resp.stepResults?.length) {
            for (const s of resp.stepResults) {
                logInfo('', 'execution_step', {
                    stepIndex: s.stepIndex,
                    stepScript: s.stepScript,
                    output: s.output || '',
                    error: s.error || '',
                    exitCode: s.exitCode,
                    success: s.success
                })
            }
        }
        
        if (resp.success) {
            logSuccess('', 'execution_complete', {
                commandSetName: commandSet.commandName
            })
        } else {
            logError(`云端执行出错: ${resp.error}`, 'execution_error', {
                commandSetName: commandSet.commandName
            })
        }
    }

    const sidebarDevices = mode === 'cloud'
        ? cloud.devices.map(d => ({id: d.deviceId, name: d.name || d.deviceId, online: d.status === 'online'}))
        : []


    type AnyEvt = MouseEvent | PointerEvent | TouchEvent | (React.SyntheticEvent & { nativeEvent?: any });

    function getTransitionOrigin(e?: AnyEvt): { x: number; y: number } {
        // 1) 鼠标 / 指针坐标（优先）
        const ne = (e as any)?.nativeEvent ?? e;
        const mx = (ne && typeof ne.clientX === "number") ? ne.clientX : undefined;
        const my = (ne && typeof ne.clientY === "number") ? ne.clientY : undefined;
        if (mx != null && my != null) return { x: mx, y: my };

        // 2) 触发元素中心（键盘触发、无鼠标坐标时）
        const ct = (e as any)?.currentTarget as HTMLElement | undefined;
        if (ct && ct.getBoundingClientRect) {
            const r = ct.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }

        // 3) 最后退：屏幕中心
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

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
                    selectedDeviceId={selectedDeviceId}
                    cloudStatus={mode === 'cloud' ? cloudStatus : undefined}
                    onSelectDevice={handleSelectDevice}
                    onConfigCloud={handleConfigCloud}
                    onRefreshDevices={cloud.refreshDevices}
                    onClose={() => { setMobileDrawerOpen(false); setMobileSidebarFull(false) }}
                    mobileFullWidth={false}
                    onToggleMode={() => {
                        setMode(m => {
                            const next = m === 'local' ? 'cloud' : 'local'
                            
                            // 清空相关状态
                            clearCommandSets()
                            clearExecution()
                            clearLog()
                            setSelectedDeviceId('')
                            
                            if (next === 'cloud') {
                                cloud.refreshDevices()
                            } else {
                                // 切换到本地模式时重新加载命令集
                                setTimeout(() => loadFromServer(), 100)
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
                                
                                // 清空相关状态
                                clearCommandSets()
                                clearExecution()
                                clearLog()
                                setSelectedDeviceId('')
                                
                                if (next === 'cloud') {
                                    cloud.refreshDevices()
                                } else {
                                    // 切换到本地模式时重新加载命令集
                                    setTimeout(() => loadFromServer(), 100)
                                }
                                
                                // 切换模式时关闭移动端内联侧栏
                                setMobileDrawerOpen(false)
                                setMobileSidebarFull(false)
                                setMobileInlineExpanded(false)
                                return next
                            })
                        }}
                        onToggleTheme={(e) => {
                            const root = document.documentElement;

                            // 1) 降噪：是否允许 VT
                            const prefersReduced = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
                            const supportsVT = "startViewTransition" in document && !prefersReduced;

                            // 2) 计算点击中心（优先用触发元素中心；没有就用视口中心）
                            const { x, y } = getTransitionOrigin(e as any);

                            const maxX = Math.max(x, innerWidth - x);
                            const maxY = Math.max(y, innerHeight - y);
                            const r = Math.hypot(maxX, maxY) + 24; // 多给一点 padding，避免边缘露底

                            // 3) 写入变量 + 打上“正在做 VT”的标记（用于冻结普通 transition）
                            root.style.setProperty("--vt-x", `${x}px`);
                            root.style.setProperty("--vt-y", `${y}px`);
                            root.style.setProperty("--vt-r", `${r}px`);
                            root.setAttribute("theme-transition", "radial");

                            const next = root.classList.contains("dark") ? "light" : "dark";

                            if (supportsVT) {
                                // @ts-ignore
                                const vt = (document as any).startViewTransition(() => {
                                    root.classList.toggle("dark");               // ① 同步切换
                                    try { localStorage.setItem("theme", next); } catch {}
                                });

                                // ② 结束后“延迟两帧”再解除冻结，避免第二段闪烁
                                vt.finished
                                    .then(() => new Promise<void>(resolve => {
                                        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                                    }))
                                    .finally(() => {
                                        root.removeAttribute("theme-transition");
                                        root.style.removeProperty("--vt-x");
                                        root.style.removeProperty("--vt-y");
                                        root.style.removeProperty("--vt-r");
                                        setTheme(next);
                                    });

                                return;
                            }

                            // 4) Fallback：只有在不支持 VT 时才启用普通 CSS 过渡
                            root.classList.add("theme-transition");
                            root.classList.toggle("dark");
                            try { localStorage.setItem("theme", next); } catch {}
                            setTheme(next);
                            setTimeout(() => root.classList.remove("theme-transition"), 320);
                        }}
                        onCreate={handleCreateCommandSet}
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
                                                selectedDeviceId={selectedDeviceId}
                                                cloudStatus={cloudStatus}
                                                onSelectDevice={handleSelectDevice}
                                                onConfigCloud={handleConfigCloud}
                                                onRefreshDevices={cloud.refreshDevices}
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
                                    mode={mode}
                                    selectedDeviceId={selectedDeviceId}
                                    availableDevices={sidebarDevices}
                                    cloudStatus={mode === 'cloud' ? cloudStatus : undefined}
                                    onRefresh={handleListAllCommandSets}
                                    onExecute={handleExecuteCommandSet2}
                                    onEdit={handleEditCommandSet}
                                    onDelete={handleDeleteCommandSet}
                                    onDuplicate={handleDuplicateCommandSet}
                                    onSelectDevice={handleSelectDevice}
                                />
                            </motion.div>

                            <motion.div layout transition={layoutTransition} className={`${isWideLocal ? 'flex-[1] min-w-[360px] min-h-0 flex flex-col' : ''}`}>
                                <Console
                                    logs={entries}
                                    execution={execution}
                                    fullHeight={isWideLocal}
                                    onClear={clearLog}
                                    onStopExecution={stopExecution}
                                    onClearExecution={clearExecution}
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

            <CloudConfigModal
                isVisible={showCloudConfig}
                currentConfig={{ baseUrl: cloud.baseUrl }}
                onSave={handleSaveCloudConfig}
                onCancel={() => setShowCloudConfig(false)}
            />
        </div>
    )
}
