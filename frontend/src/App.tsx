import React, { useMemo, useState } from 'react'
import { useLogger } from './hooks/useLogger'
import { motion, useReducedMotion } from 'motion/react'
import { Topbar } from './components/Topbar'
import { Console } from './components/Console'
import { DeviceCard } from './components/DeviceCard'
import { DeviceDetailDrawer } from './components/DeviceDetailDrawer'
import { DeviceCreateModal } from './components/DeviceCreateModal'
import type { Device } from './proto/home/service'
import { useHomeApi } from './hooks/useHomeApi'
import { useCloudApi } from './hooks/useCloudApi'
import { CloudSettings } from './components/CloudSettings'
import { TelemetryEventKind } from './proto/home/service'
// import { Sidebar } from './components/Sidebar'
import { BottomTabBar } from './components/BottomTabBar'
import { useMediaQuery } from './hooks/useMediaQuery'
import { RightToolbar } from './components/RightToolbar'
import { DeviceFilters } from './components/DeviceFilters'
import { MobileFiltersDrawer } from './components/MobileFiltersDrawer'
import type { Automation, LogEntry } from './proto/home/service'
import { AutomationEditDrawer } from './components/AutomationEditDrawer'

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

  const { logInfo, logError, logSuccess, clearLog: _clearLog, entries } = useLogger()
  const [mode, setMode] = useState<'local' | 'cloud'>(() => {
    try { return (localStorage.getItem('mode') as any) || 'local' } catch { return 'local' }
  })
  const [cloudCfg, setCloudCfg] = useState<{ baseUrl: string; agentId: string }>(() => ({
    baseUrl: (typeof localStorage !== 'undefined' ? (localStorage.getItem('cloud.baseUrl') || '/cloud') : '/cloud'),
    agentId: (typeof localStorage !== 'undefined' ? (localStorage.getItem('cloud.agentId') || '') : ''),
  }))
  const [cloudSettingsOpen, setCloudSettingsOpen] = useState(false)

  function onEvent(ev: any, data?: Record<string, any>) {
    if (!ev) return
    const id = ev.deviceId
    switch (ev.kind) {
      case TelemetryEventKind.ACTION_RESULT: {
        const ok = Boolean((data as any)?.ok ?? (data as any)?.success ?? (String((data as any)?.status ?? '').toLowerCase() === 'ok'))
        if (ok) {
          logSuccess(`动作回执成功 @ ${id}`)
        } else {
          const err = (data as any)?.error || (data as any)?.message || ''
          logError(`动作回执失败 @ ${id} ${err ? '- ' + err : ''}`, 'execution_error')
        }
        break
      }
      case TelemetryEventKind.EVENT: {
        const summary = (() => {
          try { return JSON.stringify(data).slice(0, 160) } catch { return String(data) }
        })()
        logInfo(`事件 @ ${id}: ${summary}`)
        break
      }
    }
  }
  // Call both hooks to respect Rules of Hooks; pick one based on mode
  const homeApi = useHomeApi({ onEvent })
  const cloudApi = useCloudApi({ baseUrl: cloudCfg.baseUrl, agentId: cloudCfg.agentId, onEvent })
  const api = mode === 'cloud' ? cloudApi : homeApi
  const automationApi = mode === 'local' ? homeApi : cloudApi
  const prefersReduced = useReducedMotion()
  const layoutTransition = useMemo(() => (
    prefersReduced ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as any }
  ), [prefersReduced])

  const [activeView, setActiveView] = useState<'devices' | 'automations'>('devices')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailDeviceId, setDetailDeviceId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Device | undefined>(undefined)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [showLogs, setShowLogs] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ui.showLogs')
      if (saved != null) return saved === '1'
    } catch { }
    // 默认：桌面显示，非桌面隐藏
    if (typeof window !== 'undefined') {
      return window.matchMedia('(min-width: 1024px)').matches
    }
    return true
  })
  const [logsFullscreen, setLogsFullscreen] = useState(false)
  React.useEffect(() => {
    try { localStorage.setItem('ui.showLogs', showLogs ? '1' : '0') } catch { }
  }, [showLogs])
  // 侧边栏已改造为右侧固定工具栏，移除展开状态
  React.useEffect(() => {
    api.listDevices()
    api.startWatch()
    return () => { try { api.stopWatch() } catch { } }
  }, [mode, cloudCfg.baseUrl, cloudCfg.agentId])

  React.useEffect(() => {
    if (mode === 'cloud' && activeView === 'automations') {
      loadAutomations(true)
    }
  }, [mode, activeView])


  // automation state
  const [automations, setAutomations] = useState<Automation[]>([])
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoError, setAutoError] = useState('')
  const [autoNext, setAutoNext] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterName, setFilterName] = useState('')
  const [autoEditOpen, setAutoEditOpen] = useState(false)
  const [editingAuto, setEditingAuto] = useState<Automation | undefined>(undefined)
  const [autoLogs, setAutoLogs] = useState<Record<string, { entries: LogEntry[]; loading: boolean; error?: string; next?: string }>>({})
  const [logsOpen, setLogsOpen] = useState<Record<string, boolean>>({})
  const [auditLogs, setAuditLogs] = useState<LogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [auditFilters, setAuditFilters] = useState({ kind: '', subject: '' })
  const [auditNext, setAuditNext] = useState('')
  const auditNextRef = React.useRef('')
  const auditQueryRef = React.useRef({ kind: '', subject: '' })
  const logPanelSeenRef = React.useRef(false)
  const logPanelVisible = (!isMobile && showLogs) || logsFullscreen
  const tryStringify = (obj: any) => {
    try { return JSON.stringify(obj) } catch { return String(obj) }
  }

  const loadAutomations = async (reset?: boolean) => {
    if (!automationApi) {
      setAutoError('云端模式暂不支持自动化管理')
      return
    }
    setAutoLoading(true); setAutoError('')
    try {
      const res = await automationApi.listAutomations({
        includeDisabled: true,
        tag: filterTag,
        name: filterName,
        pageSize: 20,
        pageToken: reset ? '' : autoNext,
      })
      if (!res.ok) {
        setAutoError(res.error || '加载失败')
        return
      }
      const data = res.automations || []
      setAutomations(prev => reset ? data : [...prev, ...data])
      setAutoNext(res.nextPageToken || '')
    } catch (e: any) {
      setAutoError(String(e?.message ?? e))
    } finally {
      setAutoLoading(false)
    }
  }

  const fetchAuditLogs = React.useCallback(async (reset?: boolean) => {
    console.log('[audit] fetch start reset=', reset, 'mode=', mode, 'loading=', auditLoading, 'logs=', auditLogs.length)
    if (mode === 'cloud') {
      setAuditLogs([])
      setAuditError('云端模式暂未支持查询审计日志')
      auditNextRef.current = ''
      setAuditNext('')
      setAuditLoading(false)
      return
    }
    if (auditLoading && !reset) {
      console.log('[audit] skip: already loading')
      return
    }
    setAuditLoading(true)
    setAuditError('')
    try {
      const res = await api.listAuditLogs({
        kind: auditQueryRef.current.kind,
        subject: auditQueryRef.current.subject,
        pageSize: 30,
        pageToken: reset ? '' : auditNextRef.current,
      })
      if (!res.ok) {
        setAuditError(res.error || '加载日志失败')
        if (reset) {
          setAuditLogs([])
          auditNextRef.current = ''
          setAuditNext('')
        }
        return
      }
      const batch = (res.entries as LogEntry[]) || []
      setAuditLogs(prev => reset ? batch : [...prev, ...batch])
      const nextToken = res.nextPageToken || ''
      auditNextRef.current = nextToken
      setAuditNext(nextToken)
    } catch (e: any) {
      setAuditError(String(e?.message ?? e))
      if (reset) {
        setAuditLogs([])
        auditNextRef.current = ''
        setAuditNext('')
      }
    } finally {
      setAuditLoading(false)
      console.log('[audit] fetch end next=', auditNextRef.current)
    }
  }, [api, mode, auditLoading, auditLogs.length])

  const ensureAuditLogsLoaded = React.useCallback(() => {
    if (mode === 'cloud') {
      setAuditError('云端模式暂未支持查询审计日志')
      return
    }
    if (!auditLogs.length && !auditLoading) {
      fetchAuditLogs(true)
    }
  }, [auditLoading, auditLogs.length, fetchAuditLogs, mode])

  React.useEffect(() => {
    if (logPanelVisible && !logPanelSeenRef.current) {
      logPanelSeenRef.current = true
      ensureAuditLogsLoaded()
      return
    }
    if (!logPanelVisible && logPanelSeenRef.current) {
      logPanelSeenRef.current = false
    }
  }, [logPanelVisible])

  const handleAuditFilterChange = (next: Partial<{ kind: string; subject: string }>) => {
    setAuditFilters(prev => ({ ...prev, ...next }))
  }

  const applyAuditFilters = () => {
    const next = {
      kind: auditFilters.kind.trim(),
      subject: auditFilters.subject.trim(),
    }
    auditQueryRef.current = next
    fetchAuditLogs(true)
  }

  const resetAuditFilters = () => {
    const next = { kind: '', subject: '' }
    setAuditFilters(next)
    auditQueryRef.current = next
    fetchAuditLogs(true)
  }

  React.useEffect(() => {
    if (activeView === 'automations') {
      loadAutomations(true)
    }
  }, [activeView, filterTag, filterName, mode, cloudCfg.baseUrl, cloudCfg.agentId])

  const loadAutomationLogs = async (automationId: string, reset?: boolean) => {
    if (!automationApi?.listAuditLogs) { logError('暂不支持查询日志'); return }
    setAutoLogs(prev => ({ ...prev, [automationId]: { ...(prev[automationId] || { entries: [] }), loading: true, error: undefined } }))
    const prevState = autoLogs[automationId]
    const res = await automationApi.listAuditLogs({
      subject: automationId,
      pageSize: 10,
      pageToken: reset ? '' : (prevState?.next || ''),
      kind: 'automation_execute',
    })
    if (res.ok) {
      const entries = (res as any).entries || []
      setAutoLogs(prev => ({
        ...prev,
        [automationId]: {
          entries: reset ? entries : [...(prevState?.entries || []), ...entries],
          loading: false,
          next: (res as any).nextPageToken || '',
        },
      }))
    } else {
      setAutoLogs(prev => ({ ...prev, [automationId]: { ...(prevState || { entries: [] }), loading: false, error: (res as any).error } }))
    }
  }

  const handleRefreshDevices = async () => {
    const r = await api.listDevices()
    if (r.ok) logInfo(`设备: ${r.count} 台`)
    else logError(`刷新设备失败: ${r.error}`)
    console.log(r)

  }

  const handleQuickAction = async (deviceId: string, action: string) => {
    logInfo(`执行: ${action} @ ${deviceId}`, 'execution_start', { commandSetName: action })
    const r = await api.invokeAction(deviceId, action)
    if (r.ok) {
      logSuccess(`执行完成: ${action}`, 'execution_complete', { commandSetName: action })
    } else {
      logError(`执行失败: ${r.error || r.message}`, 'execution_error', { commandSetName: action })
    }
  }

  const handleToggleLogsPanel = () => {
    setShowLogs(prev => {
      const next = !prev
      if (next) {
        setLogsFullscreen(false)
        ensureAuditLogsLoaded()
      } else {
        setLogsFullscreen(false)
      }
      return next
    })
  }

  const handleEnterLogFullscreen = () => {
    setLogsFullscreen(true)
    ensureAuditLogsLoaded()
  }

  const handleExitLogFullscreen = () => {
    setLogsFullscreen(false)
  }

  const handleRefreshAuditLogs = () => {
    fetchAuditLogs(true)
  }

  const handleLoadMoreAuditLogs = () => {
    if (auditLoading) return
    if (!auditNextRef.current) return
    fetchAuditLogs(false)
  }

  // Apply theme class to <html>
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50/60 to-violet-50/60 text-slate-900 dark:from-[#0b1220] dark:via-[#0b1220] dark:to-[#0a0f1a] dark:text-slate-100 relative selection:bg-prime-400/20 selection:text-white overflow-hidden">

      <div className="relative z-10 flex h-screen flex-col overflow-hidden">
        {/* 头部 Headbar：全宽，位于筛选栏之上，层级更高 */}
        <div className="shrink-0 z-20">
          <Topbar
            mode={mode}
            theme={theme}
            onOpenFilters={() => setMobileFiltersOpen(true)}
            onToggleTheme={(e) => {
              const root = document.documentElement;

              const prefersReduced = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
              const supportsVT = "startViewTransition" in document && !prefersReduced;

              const rect = (e.target as HTMLElement)?.getBoundingClientRect?.();
              const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
              const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
              const maxX = Math.max(x, innerWidth - x);
              const maxY = Math.max(y, innerHeight - y);
              const r = Math.hypot(maxX, maxY) + 24;

              root.style.setProperty("--vt-x", `${x}px`);
              root.style.setProperty("--vt-y", `${y}px`);
              root.style.setProperty("--vt-r", `${r}px`);
              root.setAttribute("theme-transition", "radial");

              const next = root.classList.contains("dark") ? "light" : "dark";

              if (supportsVT) {
                // @ts-expect-error: startViewTransition is experimental
                const vt = (document as any).startViewTransition(() => {
                  root.classList.toggle("dark");
                  try { localStorage.setItem("theme", next); } catch { }
                });
                vt.finished
                  .then(() => new Promise<void>(resolve => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); }))
                  .finally(() => {
                    root.removeAttribute("theme-transition");
                    root.style.removeProperty("--vt-x");
                    root.style.removeProperty("--vt-y");
                    root.style.removeProperty("--vt-r");
                    setTheme(next);
                  });
                return;
              }

              root.classList.add("theme-transition");
              root.classList.toggle("dark");
              try { localStorage.setItem("theme", next); } catch { }
              setTheme(next);
              setTimeout(() => root.classList.remove("theme-transition"), 320);
            }}
            onToggleFullscreen={() => {
              const el = document.documentElement as any
              const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement
              if (fsEl) {
                (document.exitFullscreen || (document as any).webkitExitFullscreen)?.call(document)
              } else {
                (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
              }
            }}
            onExit={() => { /* 留空：按需接入 */ }}
          />
        </div>

        {/* 主体区域：左侧筛选 + 右侧内容 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：设备快捷筛选（桌面可见），无外边距，顶天立地 */}
          {!isMobile && (
            <div className="hidden lg:flex w-64 shrink-0">
              <DeviceFilters />
            </div>
          )}
        <motion.main layout className="flex-1 flex flex-col overflow-hidden">
          {logsFullscreen ? (
            <div className="p-4 md:p-6 flex-1 overflow-hidden">
              <Console
                auditLogs={auditLogs}
                liveLogs={entries}
                loading={auditLoading}
                error={auditError}
                hasMore={Boolean(auditNext)}
                filters={auditFilters}
                onChangeFilters={handleAuditFilterChange}
                onApplyFilters={applyAuditFilters}
                onResetFilters={resetAuditFilters}
                onRefresh={handleRefreshAuditLogs}
                onLoadMore={handleLoadMoreAuditLogs}
                fullHeight
                fullScreen
                isDarkMode={theme === 'dark'}
                supported={mode === 'local'}
                onCloseFull={handleExitLogFullscreen}
              />
            </div>
          ) : (
          <div className={`p-4 md:p-6 flex-1 overflow-hidden bg-transparent`}>
              <div className="h-full min-h-0 flex gap-4">
                <motion.section
                  layout
                  transition={layoutTransition}
                  className={`flex gap-6 h-full min-h-0 flex-1 min-w-0 flex-col`}
                >
                  <motion.div layout transition={layoutTransition} className={`flex-1 min-h-0 overflow-auto`}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="inline-flex rounded-full border border-slate-200/70 bg-white/70 px-1 py-1 dark:border-white/10 dark:bg-white/5">
                        {([
                          { key: 'devices', label: '设备' },
                          { key: 'automations', label: '自动化' },
                        ] as const).map(t => (
                          <button
                            key={t.key}
                            onClick={() => setActiveView(t.key)}
                            className={`px-3 py-1 text-sm rounded-full transition-colors ${
                              activeView === t.key
                                ? 'bg-prime-500 text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      {activeView === 'devices' && (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {api.loading ? '加载设备中...' : `共 ${(Array.isArray(api.devices) ? api.devices.length : 0)} 台设备`}
                        </div>
                      )}
                      {activeView === 'automations' && (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {autoLoading ? '加载自动化...' : `共 ${automations.length} 条`}
                        </div>
                      )}
                      {api.error && activeView === 'devices' && (
                        <div className="text-xs text-red-500">{api.error}</div>
                      )}
                      {autoError && activeView === 'automations' && (
                        <div className="text-xs text-red-500">{autoError}</div>
                      )}
                    </div>
                    {activeView === 'devices' && (
                      <div className="grid gap-3 justify-center content-start grid-cols-[repeat(auto-fit,minmax(320px,420px))]">
                        {(api.devices ?? []).map(d => (
                          <motion.div key={d.id} layout transition={layoutTransition}>
                            <DeviceCard
                              device={d}
                              onQuickAction={(dev, act) => handleQuickAction(dev.id, act)}
                              onOpenDetail={(dev) => { setDetailDeviceId(dev.id); setDetailOpen(true) }}
                              onEdit={(dev) => { setEditing(dev as any); setCreateOpen(true) }}
                            />
                          </motion.div>
                        ))}
                      </div>
                    )}
                    {activeView === 'automations' && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 items-center">
                          <button
                            onClick={() => { setEditingAuto(undefined); setAutoEditOpen(true) }}
                            className="px-3 py-2 text-sm rounded-lg bg-prime-500 text-white hover:bg-prime-600 active:scale-[0.99]"
                          >
                            新建自动化
                          </button>
                          <input
                            value={filterName}
                            onChange={e => setFilterName(e.target.value)}
                            placeholder="按名称搜索"
                            className="px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 text-sm"
                          />
                          <input
                            value={filterTag}
                            onChange={e => setFilterTag(e.target.value)}
                            placeholder="按标签过滤"
                            className="px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 text-sm"
                          />
                          <button
                            onClick={() => loadAutomations(true)}
                            className="px-3 py-2 text-sm rounded-lg bg-prime-500 text-white hover:bg-prime-600 active:scale-[0.99]"
                          >
                            刷新
                          </button>
                          <button
                            disabled={!autoNext || autoLoading}
                            onClick={() => loadAutomations(false)}
                            className="px-3 py-2 text-sm rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                          >
                            加载更多
                          </button>
                        </div>
                        <div className="grid gap-3 justify-center content-start grid-cols-[repeat(auto-fit,minmax(320px,420px))]">
                          {automations.map(a => (
                            <div key={a.id} className="rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] p-4 shadow-sm flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="text-base font-semibold">{a.name || a.id}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{a.id}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={async () => {
                                      const open = !logsOpen[a.id]
                                      setLogsOpen(prev => ({ ...prev, [a.id]: open }))
                                      if (open && !autoLogs[a.id]) {
                                        await loadAutomationLogs(a.id, true)
                                      }
                                    }}
                                    className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200"
                                  >
                                    {logsOpen[a.id] ? '收起日志' : '查看日志'}
                                  </button>
                                  <button
                                    onClick={() => { setEditingAuto(a as Automation); setAutoEditOpen(true) }}
                                    className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200"
                                  >
                                    编辑
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!automationApi) { logError('云端模式暂不支持'); return }
                                      const r = await automationApi.setAutomationEnabled(a.id, !a.enabled)
                                      if (r.ok) {
                                        logSuccess(`${!a.enabled ? '启用' : '停用'}成功`)
                                        await loadAutomations(true)
                                      } else {
                                        logError(r.error || r.message || '操作失败')
                                      }
                                    }}
                                    className={`px-3 py-1 rounded-full text-xs ${a.enabled ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200'}`}
                                  >
                                    {a.enabled ? '已启用' : '已停用'}
                                  </button>
                                </div>
                              </div>
                              <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                {a.when ? `触发: ${(a.when as any).type || '未知'}` : '无触发条件'}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                动作: {a.then?.length || 0} 个
                              </div>
                              <div className="flex gap-2 mt-1">
                                <button
                                  onClick={async () => {
                                    logInfo(`手动触发: ${a.name || a.id}`)
                                    if (!automationApi) { logError('云端模式暂不支持'); return }
                                    const r = await automationApi.triggerAutomation(a.id)
                                    if (r.ok) logSuccess('触发成功')
                                    else logError(r.error || r.message || '触发失败')
                                  }}
                                  className="flex-1 px-3 py-2 rounded-lg bg-prime-500 text-white hover:bg-prime-600 active:scale-[0.99]"
                                >
                                  手动触发
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!automationApi) { logError('云端模式暂不支持'); return }
                                    const r = await automationApi.setAutomationEnabled(a.id, !a.enabled)
                                    if (r.ok) {
                                      logSuccess(`${!a.enabled ? '启用' : '停用'}成功`)
                                      await loadAutomations(true)
                                    } else {
                                      logError(r.error || r.message || '操作失败')
                                    }
                                  }}
                                  className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 active:scale-[0.99]"
                                >
                                  {a.enabled ? '停用' : '启用'}
                                </button>
                              </div>
                              {a.tags && a.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {a.tags.map(t => (
                                    <span key={t} className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-200">{t}</span>
                                  ))}
                                </div>
                              )}
                              {logsOpen[a.id] && (
                                <div className="mt-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 p-2 space-y-1">
                                  {autoLogs[a.id]?.loading && <div className="text-xs text-slate-500">加载日志...</div>}
                                  {autoLogs[a.id]?.error && <div className="text-xs text-red-500">{autoLogs[a.id]?.error}</div>}
                                  {(autoLogs[a.id]?.entries || []).map((log) => (
                                    <div key={log.id} className="text-xs text-slate-600 dark:text-slate-300 flex justify-between gap-2">
                                      <span className="truncate">{new Date(Number(log.ts || 0)).toLocaleTimeString()} · {log.kind}</span>
                                      {log.data && <span className="truncate text-slate-500">{tryStringify(log.data)}</span>}
                                    </div>
                                  ))}
                                  {autoLogs[a.id]?.next && (
                                    <button
                                      onClick={() => loadAutomationLogs(a.id, false)}
                                      className="text-xs px-3 py-1 rounded-full bg-white/70 dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10"
                                    >
                                      加载更多
                                    </button>
                                  )}
                                  {(!autoLogs[a.id]?.entries || autoLogs[a.id]?.entries.length === 0) && !autoLogs[a.id]?.loading && (
                                    <div className="text-xs text-slate-500">暂无日志</div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                          {!automations.length && !autoLoading && (
                            <div className="text-sm text-slate-500 dark:text-slate-400">暂无自动化</div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>

                  {/* 日志开关：移动端隐藏不参与布局；平板/桌面可控 */}
                    {!isMobile && showLogs && (
                      <motion.div layout="position" transition={{ duration: prefersReduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] as any }}>
                        <Console
                          auditLogs={auditLogs}
                          liveLogs={entries}
                          loading={auditLoading}
                          error={auditError}
                          hasMore={Boolean(auditNext)}
                          filters={auditFilters}
                          onChangeFilters={handleAuditFilterChange}
                          onApplyFilters={applyAuditFilters}
                          onResetFilters={resetAuditFilters}
                          onRefresh={handleRefreshAuditLogs}
                          onLoadMore={handleLoadMoreAuditLogs}
                          fullHeight={false}
                          isDarkMode={theme === 'dark'}
                          supported={mode === 'local'}
                          onExpand={handleEnterLogFullscreen}
                        />
                      </motion.div>
                    )}
                </motion.section>
              </div>
            </div>
          )}
        </motion.main>
        </div>
      </div>

      {/* 右侧固定工具栏（桌面端样式 A：悬浮窄柱） */}
      {!isMobile && (
        <RightToolbar
          mode={mode}
          showLogs={showLogs}
          onRefreshDevices={handleRefreshDevices}
          onToggleMode={() => {
            const next = mode === 'local' ? 'cloud' : 'local'
            setMode(next)
            try { localStorage.setItem('mode', next) } catch { }
          }}
          onConfigCloud={() => setCloudSettingsOpen(true)}
          onToggleLogs={handleToggleLogsPanel}
          onAddDevice={() => setCreateOpen(true)}
        />
      )}

      {/* 移动端筛选抽屉 */}
      {isMobile && (
        <MobileFiltersDrawer
          open={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
        >
          <DeviceFilters />
        </MobileFiltersDrawer>
      )}

      {/* 底部 TabBar（仅移动端，承载侧边栏功能） */}
      <BottomTabBar
        visible={isMobile}
        mode={mode}
        logsActive={logsFullscreen}
        onChange={(tab) => {
          switch (tab) {
            case 'logs':
              setLogsFullscreen(prev => {
                const next = !prev
                if (next) ensureAuditLogsLoaded()
                return next
              })
              break
            case 'refresh':
              if (activeView === 'automations') {
                loadAutomations(true)
              } else {
                handleRefreshDevices();
              }
              break
            case 'mode': {
              const next = mode === 'local' ? 'cloud' : 'local'
              setMode(next)
              try { localStorage.setItem('mode', next) } catch { }
              break
            }
            case 'add':
              if (activeView === 'automations') {
                // 预留：自动化编辑暂未实现
              } else {
                setCreateOpen(true)
              }
              break
            case 'settings':
              setCloudSettingsOpen(true)
              break
          }
        }}
      />

      <DeviceDetailDrawer
        open={detailOpen}
        device={api.devices.find(d => d.id === detailDeviceId)}
        onClose={() => setDetailOpen(false)}
        onEdit={(dev) => { setDetailOpen(false); setEditing(dev as any); setCreateOpen(true) }}
        onInvoke={async (id, action, args) => {
          logInfo(`执行: ${action} @ ${id}`, 'execution_start', { commandSetName: action })
          const r = await api.invokeAction(id, action, args)
          if (r.ok) logSuccess(`执行完成: ${action}`, 'execution_complete', { commandSetName: action })
          else logError(`执行失败: ${r.error || r.message}`, 'execution_error', { commandSetName: action })
        }}
      />

      <DeviceCreateModal
        open={createOpen}
        initialDevice={editing}
        api={api}
        onCancel={() => { setCreateOpen(false); setEditing(undefined) }}
        onCreate={async (device) => {
          const r = await api.upsertDevice(device)
          if (r.ok) {
            logSuccess(`${editing ? '设备已更新' : '设备已创建'}: ${device.name || device.id}`)
            setCreateOpen(false); setEditing(undefined)
            await api.listDevices()
          } else {
            logError(`创建设备失败: ${r.error || r.message}`)
          }
        }}
      />

      <CloudSettings
        open={cloudSettingsOpen}
        onClose={() => setCloudSettingsOpen(false)}
        onSaved={(cfg) => {
          setCloudCfg(cfg)
        }}
      />

      <AutomationEditDrawer
        open={autoEditOpen}
        initial={editingAuto}
        onClose={() => { setAutoEditOpen(false); setEditingAuto(undefined) }}
        onSubmit={async (automation) => {
          if (!automationApi) throw new Error('云端模式暂不支持自动化管理')
          const res = await automationApi.upsertAutomation(automation)
          if (!res.ok) throw new Error(res.error || res.message || '保存失败')
          logSuccess(`${editingAuto ? '更新' : '创建'}成功`)
          setAutoEditOpen(false); setEditingAuto(undefined)
          await loadAutomations(true)
        }}
      />

      {/* 移除右下角日志开关，保留侧边栏控制 */}
    </div>
  )
}
