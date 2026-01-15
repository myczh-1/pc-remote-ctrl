import React, { useMemo, useState, useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Topbar } from './components/Topbar'
import { DeviceDetailDrawer } from './components/DeviceDetailDrawer'
import { DeviceCreateModal } from './components/DeviceCreateModal'
import { DeviceModelModal } from './components/DeviceModelModal'
import { CloudSettings } from './components/CloudSettings'
import { BottomTabBar } from './components/BottomTabBar'
import { RightToolbar } from './components/RightToolbar'
import { DeviceFilters } from './components/DeviceFilters'
import { MobileFiltersDrawer } from './components/MobileFiltersDrawer'
import { AutomationEditDrawer } from './components/AutomationEditDrawer'
import { useLogger } from './hooks/useLogger'
import { useHomeApi } from './hooks/useHomeApi'
import { useCloudApi } from './hooks/useCloudApi'
import { useAppShell } from './hooks/useAppShell'
import { useDevicesView } from './hooks/useDevicesView'
import { useAutomationsView } from './hooks/useAutomationsView'
import { useModelsView } from './hooks/useModelsView'
import { useAuditLogs } from './hooks/useAuditLogs'
import { DevicesPage } from './pages/DevicesPage'
import { AutomationsPage } from './pages/AutomationsPage'
import { ModelsPage } from './pages/ModelsPage'
import { LogsPanel } from './containers/LogsPanel'
import type { ActionSpec, Automation, Device, DeviceModel } from './proto/home/service'
import { TelemetryEventKind } from './proto/home/service'

function buildTinyAuthFromHost(protocol: string, hostname: string, port?: string): string {
  if (!protocol || !hostname) return ''
  const portPart = port ? `:${port}` : ''
  const lowerHost = hostname.toLowerCase()
  if (lowerHost === 'localhost' || lowerHost.startsWith('127.') || lowerHost === '::1') {
    return `${protocol}//${hostname}${portPart}`
  }
  const parts = hostname.split('.')
  if (parts.length > 1) {
    parts[0] = 'tinyauth'
    return `${protocol}//${parts.join('.')}${portPart}`
  }
  return `${protocol}//tinyauth.${hostname}${portPart}`
}

function deriveTinyAuthOrigin(cloudBase?: string): string {
  const envVal = ((import.meta as any)?.env?.VITE_TINYAUTH_URL as string | undefined)?.trim()
  if (envVal) {
    return envVal.replace(/\/+$/, '')
  }
  const loc = typeof window !== 'undefined' ? window.location : undefined
  const fallbackOrigin = loc ? `${loc.protocol}//${loc.host}` : 'http://localhost'
  const candidates = [cloudBase, fallbackOrigin]
  for (const raw of candidates) {
    if (!raw) continue
    try {
      const base = new URL(raw, fallbackOrigin)
      const derived = buildTinyAuthFromHost(base.protocol, base.hostname, base.port)
      if (derived) {
        return derived.replace(/\/+$/, '')
      }
    } catch {
      continue
    }
  }
  return ''
}

export default function App() {
  const {
    theme,
    mode,
    cloudCfg,
    setCloudCfg,
    cloudSettingsOpen,
    setCloudSettingsOpen,
    isMobile,
    mobileFiltersOpen,
    setMobileFiltersOpen,
    showLogs,
    setShowLogs,
    logsFullscreen,
    setLogsFullscreen,
    toggleTheme,
    toggleMode,
  } = useAppShell()

  const { logInfo, logError, logSuccess, entries } = useLogger()
  const [activeView, setActiveView] = useState<'devices' | 'automations' | 'models'>('devices')

  function onEvent(ev: any, data?: Record<string, any>) {
    if (!ev) return
    const id = ev.deviceId
    switch (ev.kind) {
      case TelemetryEventKind.ACTION_RESULT: {
        const ok = Boolean((data as any)?.ok ?? (data as any)?.success ?? (String((data as any)?.status ?? '').toLowerCase() === 'ok'))
        const corrId = (data as any)?.corr_id ? String((data as any).corr_id) : ''
        if (ok) {
          logSuccess(`动作回执成功 @ ${id}${corrId ? ` (${corrId})` : ''}`)
        } else {
          const err = (data as any)?.error || (data as any)?.message || ''
          logError(`动作回执失败 @ ${id}${corrId ? ` (${corrId})` : ''} ${err ? '- ' + err : ''}`, 'execution_error')
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

  const homeApi = useHomeApi({ onEvent })
  const cloudApi = useCloudApi({ baseUrl: cloudCfg.baseUrl, agentId: cloudCfg.agentId, onEvent })
  const api = mode === 'cloud' ? cloudApi : homeApi
  const automationApi = mode === 'local' ? homeApi : cloudApi

  const devicesView = useDevicesView(api, { logInfo, logError, logSuccess })
  const automationsView = useAutomationsView(automationApi ?? null, { logInfo, logError, logSuccess })
  const modelsView = useModelsView(api, { logError, logSuccess })
  const audit = useAuditLogs(api.listAuditLogs)

  const prefersReduced = useReducedMotion()
  const layoutTransition = useMemo(() => (
    prefersReduced ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as any }
  ), [prefersReduced])
  const viewTransition = useMemo(() => (
    prefersReduced ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as any }
  ), [prefersReduced])
  const tinyAuthOrigin = useMemo(() => deriveTinyAuthOrigin(cloudCfg.baseUrl), [cloudCfg.baseUrl])
  const logPanelSeenRef = React.useRef(false)
  const logPanelVisible = (!isMobile && showLogs) || logsFullscreen

  const handleCloudLogout = React.useCallback(() => {
    if (mode !== 'cloud') return
    if (!tinyAuthOrigin) {
      logError('TinyAuth URL 未配置，无法退出')
      return
    }
    if (typeof window === 'undefined') {
      return
    }
    try {
      const base = tinyAuthOrigin.endsWith('/') ? tinyAuthOrigin : `${tinyAuthOrigin}/`
      const logoutUrl = new URL('/logout', base)
      logoutUrl.searchParams.set('redirect_uri', window.location.origin)
      window.location.href = logoutUrl.toString()
    } catch (err: any) {
      logError(`TinyAuth 退出失败: ${String(err?.message ?? err)}`)
    }
  }, [mode, tinyAuthOrigin, logError])

  useEffect(() => {
    api.startWatch()
    return () => { try { api.stopWatch() } catch { } }
  }, [mode, cloudCfg.baseUrl, cloudCfg.agentId, api.startWatch, api.stopWatch])

  useEffect(() => {
    devicesView.requestDevicesWithRemoteFilters()
  }, [devicesView.requestDevicesWithRemoteFilters])

  useEffect(() => {
    if (activeView === 'automations') {
      automationsView.loadAutomations(true)
    }
  }, [activeView, automationsView.loadAutomations, automationsView.filterTag, automationsView.filterName, mode, cloudCfg.baseUrl, cloudCfg.agentId])

  useEffect(() => {
    if (mode === 'local' && activeView === 'models') {
      modelsView.loadDeviceModels()
    }
  }, [activeView, mode, modelsView.loadDeviceModels])

  useEffect(() => {
    if (mode === 'local' && devicesView.createOpen && modelsView.models.length === 0) {
      modelsView.loadDeviceModels()
    }
  }, [devicesView.createOpen, mode, modelsView.loadDeviceModels, modelsView.models.length])

  useEffect(() => {
    if (logPanelVisible && !logPanelSeenRef.current) {
      logPanelSeenRef.current = true
      audit.ensureAuditLogsLoaded()
      return
    }
    if (!logPanelVisible && logPanelSeenRef.current) {
      logPanelSeenRef.current = false
    }
  }, [audit.ensureAuditLogsLoaded, logPanelVisible])

  useEffect(() => {
    if (activeView !== 'devices' && mobileFiltersOpen) {
      setMobileFiltersOpen(false)
    }
  }, [activeView, mobileFiltersOpen, setMobileFiltersOpen])

  const handleToggleLogsPanel = () => {
    setShowLogs(prev => {
      const next = !prev
      if (next) {
        setLogsFullscreen(false)
        audit.ensureAuditLogsLoaded()
      } else {
        setLogsFullscreen(false)
      }
      return next
    })
  }

  const handleEnterLogFullscreen = () => {
    setLogsFullscreen(true)
    audit.ensureAuditLogsLoaded()
  }

  const handleExitLogFullscreen = () => {
    setLogsFullscreen(false)
  }

  const handleQuickAction = async (device: Device, action: ActionSpec) => {
    await devicesView.handleQuickAction(device, action)
  }

  const handleDeleteDevice = async (device?: Device) => {
    if (!device) return
    const confirmed = window.confirm(`确认删除设备：${device.name || device.id}？`)
    if (!confirmed) return
    const res = await api.deleteDevice(device.id)
    if (res.ok) {
      logSuccess(`设备已删除：${device.name || device.id}`)
      devicesView.clearDetail()
      await api.listDevices()
    } else {
      logError(res.error || res.message || '删除失败')
    }
  }

  const handleDeleteModel = async (model: DeviceModel) => {
    const confirmed = window.confirm(`确认删除模型 ${model.id}@${model.version}？`)
    if (!confirmed) return
    await modelsView.deleteModel(model)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50/60 to-violet-50/60 text-slate-900 dark:from-[#0b1220] dark:via-[#0b1220] dark:to-[#0a0f1a] dark:text-slate-100 relative selection:bg-prime-400/20 selection:text-white overflow-hidden">
      <div className="relative z-10 flex h-screen flex-col overflow-hidden">
        <div className="shrink-0 z-20">
          <Topbar
            mode={mode}
            theme={theme}
            onOpenFilters={() => {
              if (activeView !== 'devices') return
              setMobileFiltersOpen(true)
            }}
            onToggleTheme={toggleTheme}
            onToggleFullscreen={() => {
              const el = document.documentElement as any
              const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement
              if (fsEl) {
                (document.exitFullscreen || (document as any).webkitExitFullscreen)?.call(document)
              } else {
                (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
              }
            }}
            onExit={mode === 'cloud' ? handleCloudLogout : undefined}
          />
        </div>

        <div className="flex-1 flex overflow-hidden">

          <motion.main layout className="flex-1 flex flex-col overflow-hidden">
            {logsFullscreen ? (
              <div className="p-4 md:p-6 flex-1 overflow-hidden">
                <LogsPanel
                  auditLogs={audit.auditLogs}
                  liveLogs={entries}
                  loading={audit.auditLoading}
                  error={audit.auditError}
                  hasMore={Boolean(audit.auditNext)}
                  filters={audit.auditFilters}
                  onChangeFilters={audit.handleAuditFilterChange}
                  onApplyFilters={audit.applyAuditFilters}
                  onResetFilters={audit.resetAuditFilters}
                  onRefresh={audit.refreshAuditLogs}
                  onLoadMore={audit.loadMoreAuditLogs}
                  fullHeight
                  fullScreen
                  isDarkMode={theme === 'dark'}
                  supported={mode === 'local'}
                  onCloseFull={handleExitLogFullscreen}
                />
              </div>
            ) : (
              <div className="p-4 md:p-6 flex-1 overflow-hidden bg-transparent">
                <div className="h-full min-h-0 flex gap-4">
                  <motion.section
                    layout
                    transition={layoutTransition}
                    className="flex gap-6 h-full min-h-0 flex-1 min-w-0 flex-col"
                  >
                    <motion.div layout transition={layoutTransition} className="flex-1 min-h-0 overflow-auto">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="inline-flex rounded-full border border-slate-200/70 bg-white/70 px-1 py-1 dark:border-white/10 dark:bg-white/5">
                          {([
                            { key: 'devices', label: '设备' },
                            { key: 'automations', label: '自动化' },
                            ...(mode === 'local' ? [{ key: 'models', label: '模型' }] : []),
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
                            {api.loading
                              ? '加载设备中...'
                              : `已筛选 ${devicesView.visibleDevices.length} 台${devicesView.totalDevices !== devicesView.visibleDevices.length ? `（全部 ${devicesView.totalDevices} 台）` : ''}`}
                          </div>
                        )}
                        {activeView === 'automations' && (
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            {automationsView.autoLoading ? '加载自动化...' : `共 ${automationsView.automations.length} 条`}
                          </div>
                        )}
                        {activeView === 'models' && (
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            {modelsView.modelLoading ? '加载模型...' : `共 ${modelsView.models.length} 个`}
                          </div>
                        )}
                        {api.error && activeView === 'devices' && (
                          <div className="text-xs text-red-500">{api.error}</div>
                        )}
                        {automationsView.autoError && activeView === 'automations' && (
                          <div className="text-xs text-red-500">{automationsView.autoError}</div>
                        )}
                        {modelsView.modelError && activeView === 'models' && (
                          <div className="text-xs text-red-500">{modelsView.modelError}</div>
                        )}
                      </div>

                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={activeView}
                          initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                          animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                          transition={viewTransition}
                        >
                      {activeView === 'devices' && (
                        <DevicesPage
                          devices={devicesView.visibleDevices}
                          layoutTransition={layoutTransition}
                          onQuickAction={handleQuickAction}
                          onOpenDetail={(dev) => devicesView.openDetail(dev.id)}
                          onEdit={(dev) => devicesView.startEdit(dev)}
                          showFilters={!isMobile}
                          filtersPanel={(
                            <DeviceFilters
                              search={devicesView.deviceFilters.search}
                              status={devicesView.deviceFilters.status}
                              room={devicesView.deviceFilters.room}
                              rooms={devicesView.availableRooms}
                              availableTags={devicesView.availableTags}
                              selectedTags={devicesView.deviceFilters.tags}
                              onSearchChange={devicesView.handleDeviceSearchChange}
                              onStatusChange={devicesView.handleDeviceStatusChange}
                              onRoomChange={devicesView.handleDeviceRoomChange}
                              onToggleTag={devicesView.handleToggleDeviceTag}
                              onReset={devicesView.handleResetDeviceFilters}
                            />
                          )}
                        />
                      )}

                          {activeView === 'automations' && (
                            <AutomationsPage
                              automations={automationsView.automations}
                              autoLoading={automationsView.autoLoading}
                              autoNext={automationsView.autoNext}
                              filterName={automationsView.filterName}
                              filterTag={automationsView.filterTag}
                              onFilterNameChange={automationsView.setFilterName}
                              onFilterTagChange={automationsView.setFilterTag}
                              onCreate={() => { automationsView.setEditingAuto(undefined); automationsView.setAutoEditOpen(true) }}
                              onRefresh={() => automationsView.loadAutomations(true)}
                              onLoadMore={() => automationsView.loadAutomations(false)}
                              onToggleLog={automationsView.toggleLogOpen}
                              onEdit={(a) => { automationsView.setEditingAuto(a as Automation); automationsView.setAutoEditOpen(true) }}
                              onToggleEnabled={automationsView.toggleEnabled}
                              onTrigger={automationsView.triggerAutomation}
                              autoLogs={automationsView.autoLogs}
                              logsOpen={automationsView.logsOpen}
                              onLoadAutomationLogs={(id) => automationsView.loadAutomationLogs(id, false)}
                            />
                          )}

                          {activeView === 'models' && (
                            <ModelsPage
                              models={modelsView.models}
                              modelLoading={modelsView.modelLoading}
                              onCreate={() => { modelsView.setEditingModel(undefined); modelsView.setModelEditOpen(true) }}
                              onRefresh={modelsView.loadDeviceModels}
                              onEdit={(m) => { modelsView.setEditingModel(m); modelsView.setModelEditOpen(true) }}
                              onDelete={handleDeleteModel}
                            />
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </motion.div>

                    {!isMobile && showLogs && (
                      <motion.div layout="position" transition={{ duration: prefersReduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] as any }}>
                        <LogsPanel
                          auditLogs={audit.auditLogs}
                          liveLogs={entries}
                          loading={audit.auditLoading}
                          error={audit.auditError}
                          hasMore={Boolean(audit.auditNext)}
                          filters={audit.auditFilters}
                          onChangeFilters={audit.handleAuditFilterChange}
                          onApplyFilters={audit.applyAuditFilters}
                          onResetFilters={audit.resetAuditFilters}
                          onRefresh={audit.refreshAuditLogs}
                          onLoadMore={audit.loadMoreAuditLogs}
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

      {!isMobile && (
        <RightToolbar
          mode={mode}
          showLogs={showLogs}
          onRefreshDevices={devicesView.handleRefreshDevices}
          onToggleMode={toggleMode}
          onConfigCloud={() => setCloudSettingsOpen(true)}
          onToggleLogs={handleToggleLogsPanel}
          onAddDevice={() => devicesView.setCreateOpen(true)}
        />
      )}

      {isMobile && activeView === 'devices' && (
        <MobileFiltersDrawer
          open={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
        >
          <DeviceFilters
            search={devicesView.deviceFilters.search}
            status={devicesView.deviceFilters.status}
            room={devicesView.deviceFilters.room}
            rooms={devicesView.availableRooms}
            availableTags={devicesView.availableTags}
            selectedTags={devicesView.deviceFilters.tags}
            onSearchChange={devicesView.handleDeviceSearchChange}
            onStatusChange={devicesView.handleDeviceStatusChange}
            onRoomChange={devicesView.handleDeviceRoomChange}
            onToggleTag={devicesView.handleToggleDeviceTag}
            onReset={() => { devicesView.handleResetDeviceFilters(); setMobileFiltersOpen(false) }}
          />
        </MobileFiltersDrawer>
      )}

      <BottomTabBar
        visible={isMobile}
        mode={mode}
        logsActive={logsFullscreen}
        onChange={(tab) => {
          switch (tab) {
            case 'logs':
              setLogsFullscreen(prev => {
                const next = !prev
                if (next) audit.ensureAuditLogsLoaded()
                return next
              })
              break
            case 'refresh':
              if (activeView === 'automations') {
                automationsView.loadAutomations(true)
              } else {
                devicesView.handleRefreshDevices()
              }
              break
            case 'mode':
              toggleMode()
              break
            case 'add':
              if (activeView === 'automations') {
                // 预留：自动化编辑暂未实现
              } else {
                devicesView.setCreateOpen(true)
              }
              break
            case 'settings':
              setCloudSettingsOpen(true)
              break
          }
        }}
      />

      <DeviceDetailDrawer
        open={devicesView.detailOpen}
        device={api.devices.find(d => d.id === devicesView.detailDeviceId)}
        initialActionName={devicesView.detailInitialAction}
        onClose={devicesView.closeDetail}
        onEdit={(dev) => { devicesView.closeDetail(); devicesView.startEdit(dev as any) }}
        onDelete={handleDeleteDevice}
        onInvoke={async (id, action, args) => {
          logInfo(`执行: ${action} @ ${id}`, 'execution_start', { commandSetName: action })
          const r = await api.invokeAction(id, action, args)
          if (r.ok) logSuccess(`执行完成: ${action}${r.corrId ? ` (${r.corrId})` : ''}`, 'execution_complete', { commandSetName: action })
          else logError(`执行失败: ${r.error || r.message}`, 'execution_error', { commandSetName: action })
        }}
      />

      <DeviceCreateModal
        open={devicesView.createOpen}
        initialDevice={devicesView.editing}
        api={api}
        models={modelsView.models}
        onCancel={devicesView.stopEdit}
        onCreate={async (device) => {
          const r = await api.upsertDevice(device)
          if (r.ok) {
            logSuccess(`${devicesView.editing ? '设备已更新' : '设备已创建'}: ${device.name || device.id}`)
            devicesView.stopEdit()
            await api.listDevices()
          } else {
            logError(`创建设备失败: ${r.error || r.message}`)
          }
          return { ok: r.ok, error: r.error || r.message }
        }}
      />

      <DeviceModelModal
        open={modelsView.modelEditOpen}
        initialModel={modelsView.editingModel}
        onCancel={() => { modelsView.setModelEditOpen(false); modelsView.setEditingModel(undefined) }}
        onSubmit={modelsView.submitModel}
      />

      <CloudSettings
        open={cloudSettingsOpen}
        onClose={() => setCloudSettingsOpen(false)}
        onSaved={(cfg) => {
          setCloudCfg(cfg)
        }}
      />

      <AutomationEditDrawer
        open={automationsView.autoEditOpen}
        initial={automationsView.editingAuto}
        onClose={() => { automationsView.setAutoEditOpen(false); automationsView.setEditingAuto(undefined) }}
        onSubmit={automationsView.submitAutomation}
      />
    </div>
  )
}
