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

  const { logInfo, logError, logSuccess, clearLog, entries } = useLogger()
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
  const prefersReduced = useReducedMotion()
  const layoutTransition = useMemo(() => (
    prefersReduced ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as any }
  ), [prefersReduced])

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
    } catch {}
    // 默认：桌面显示，非桌面隐藏
    if (typeof window !== 'undefined') {
      return window.matchMedia('(min-width: 1024px)').matches
    }
    return true
  })
  React.useEffect(() => {
    try { localStorage.setItem('ui.showLogs', showLogs ? '1' : '0') } catch {}
  }, [showLogs])
  // 侧边栏已改造为右侧固定工具栏，移除展开状态
  React.useEffect(() => {
    api.listDevices()
    api.startWatch()
    return () => { try { api.stopWatch() } catch {} }
  }, [mode, cloudCfg.baseUrl, cloudCfg.agentId])

  const handleRefreshDevices = async () => {
    const r = await api.listDevices()
    if (r.ok) logInfo(`设备: ${r.count} 台`)
    else logError(`刷新设备失败: ${r.error}`)
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
                // @ts-ignore
                const vt = (document as any).startViewTransition(() => {
                  root.classList.toggle("dark");
                  try { localStorage.setItem("theme", next); } catch {}
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
              try { localStorage.setItem("theme", next); } catch {}
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
          <div className={`p-4 md:p-6 flex-1 overflow-hidden bg-transparent`}>
            <div className="h-full min-h-0 flex gap-4">
              <motion.section
                layout
                transition={layoutTransition}
                className={`flex gap-6 h-full min-h-0 flex-1 min-w-0 flex-col`}
              >
                <motion.div layout transition={layoutTransition} className={`flex-1 min-h-0 overflow-auto`}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {api.loading ? '加载设备中...' : `共 ${(Array.isArray(api.devices) ? api.devices.length : 0)} 台设备`}
                    </div>
                    {api.error && (
                      <div className="text-xs text-red-500">{api.error}</div>
                    )}
                  </div>
                  {/* 设备卡片网格：移动 2 列，平板 2 列，桌面 3 列，超宽 4 列 */}
                  <div className="grid gap-3 grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                </motion.div>

                {/* 日志开关：移动端隐藏不参与布局；平板/桌面可控 */}
                {!isMobile && showLogs && (
                  <motion.div layout transition={layoutTransition}>
                    <Console
                      logs={entries}
                      fullHeight={false}
                      isDarkMode={theme === 'dark'}
                    />
                  </motion.div>
                )}
              </motion.section>
            </div>
          </div>
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
            try { localStorage.setItem('mode', next) } catch {}
          }}
          onConfigCloud={() => setCloudSettingsOpen(true)}
          onToggleLogs={() => setShowLogs(v => !v)}
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
        onChange={(tab) => {
          switch (tab) {
            case 'refresh':
              handleRefreshDevices();
              break
            case 'mode': {
              const next = mode === 'local' ? 'cloud' : 'local'
              setMode(next)
              try { localStorage.setItem('mode', next) } catch {}
              break
            }
            case 'add':
              setCreateOpen(true)
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

      {/* 移除右下角日志开关，保留侧边栏控制 */}
    </div>
  )
}
