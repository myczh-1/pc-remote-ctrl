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
  const home = useHomeApi()
  const prefersReduced = useReducedMotion()
  const layoutTransition = useMemo(() => (
    prefersReduced ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as any }
  ), [prefersReduced])

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailDeviceId, setDetailDeviceId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Device | undefined>(undefined)
  const startedRef = React.useRef(false)

  React.useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    home.listDevices()
    home.startWatch()
    return () => home.stopWatch()
  }, [])

  const handleRefreshDevices = async () => {
    const r = await home.listDevices()
    if (r.ok) logInfo(`设备: ${r.count} 台`)
    else logError(`刷新设备失败: ${r.error}`)
  }

  const handleQuickAction = async (deviceId: string, action: string) => {
    logInfo(`执行: ${action} @ ${deviceId}`, 'execution_start', { commandSetName: action })
    const r = await home.invokeAction(deviceId, action)
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
    <div className="min-h-screen bg-white text-slate-900 dark:bg-surface dark:text-slate-100 relative selection:bg-prime-400/20 selection:text-white overflow-hidden">
      <div className="absolute inset-0 bg-glow pointer-events-none overflow-hidden"></div>

      <div className="relative z-10 flex h-screen overflow-hidden">
        <motion.main layout className="flex-1 flex flex-col overflow-hidden">
          <Topbar
            mode="local"
            theme={theme}
            onAddDevice={() => setCreateOpen(true)}
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
            onCreate={handleRefreshDevices}
          />

          <div className={`p-4 md:p-6 flex-1 overflow-hidden bg-white dark:bg-surface`}>
            <div className="h-full min-h-0 flex gap-4">
              <motion.section
                layout
                transition={layoutTransition}
                className={`flex gap-6 h-full min-h-0 flex-1 min-w-0 flex-col`}
              >
                <motion.div layout transition={layoutTransition} className={`flex-1 min-h-0 overflow-auto`}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {home.loading ? '加载设备中...' : `共 ${home.devices.length} 台设备`}
                    </div>
                    {home.error && (
                      <div className="text-xs text-red-500">{home.error}</div>
                    )}
                  </div>
                  <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
                    {home.devices.map(d => (
                      <DeviceCard
                        key={d.id}
                        device={d}
                        onQuickAction={(dev, act) => handleQuickAction(dev.id, act)}
                        onOpenDetail={(dev) => { setDetailDeviceId(dev.id); setDetailOpen(true) }}
                        onEdit={(dev) => { setEditing(dev as any); setCreateOpen(true) }}
                      />
                    ))}
                  </div>
                </motion.div>

                <motion.div layout transition={layoutTransition}>
                  <Console
                    logs={entries}
                    fullHeight={false}
                    onClear={clearLog}
                    isDarkMode={theme === 'dark'}
                    onCopy={() => {
                      try { navigator.clipboard.writeText(entries.map(e => e.message).join('\n')) } catch {}
                    }}
                  />
                </motion.div>
              </motion.section>
            </div>
          </div>
        </motion.main>
      </div>

      <DeviceDetailDrawer
        open={detailOpen}
        device={home.devices.find(d => d.id === detailDeviceId)}
        onClose={() => setDetailOpen(false)}
        onEdit={(dev) => { setDetailOpen(false); setEditing(dev as any); setCreateOpen(true) }}
        onInvoke={async (id, action, args) => {
          logInfo(`执行: ${action} @ ${id}`, 'execution_start', { commandSetName: action })
          const r = await home.invokeAction(id, action, args)
          if (r.ok) logSuccess(`执行完成: ${action}`, 'execution_complete', { commandSetName: action })
          else logError(`执行失败: ${r.error || r.message}`, 'execution_error', { commandSetName: action })
        }}
      />

      <DeviceCreateModal
        open={createOpen}
        initialDevice={editing}
        onCancel={() => { setCreateOpen(false); setEditing(undefined) }}
        onCreate={async (device) => {
          const r = await home.upsertDevice(device)
          if (r.ok) {
            logSuccess(`${editing ? '设备已更新' : '设备已创建'}: ${device.name || device.id}`)
            setCreateOpen(false); setEditing(undefined)
            await home.listDevices()
          } else {
            logError(`创建设备失败: ${r.error || r.message}`)
          }
        }}
      />
    </div>
  )
}
