import { useState } from 'react'

interface TopbarProps {
  mode: 'local' | 'cloud'
  theme: 'light' | 'dark'
  onToggleTheme?: (e: MouseEvent) => void
  onCreate?: () => void // 刷新设备
  onAddDevice?: () => void // 添加设备
  onToggleMode?: () => void // 移动端：切换本地/云端
  onOpenCloudSettings?: () => void // 云端设置
}

export function Topbar({ mode, theme, onToggleTheme, onCreate, onAddDevice, onToggleMode, onOpenCloudSettings }: TopbarProps) {
  const [refreshSpin, setRefreshSpin] = useState(false)
  const [addPop, setAddPop] = useState(false)
  return (
    <header className="flex items-center gap-3 border-b border-black/10 bg-white/60 px-5 py-3 backdrop-blur-md backdrop-saturate-[1.4] transition-colors dark:border-white/5 dark:bg-white/[0.08]">
      <div className="flex items-center gap-2 mr-2">
        <button className="rounded-lg p-2 hover:bg-white/5" title="切换本地/云端" onClick={onToggleMode}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      
      <div className="hidden md:block flex-1 max-w-2xl">
        <div>
          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">PC 远程控制器</div>
          <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">设备控制与状态（当前模式：{mode === 'local' ? '本地' : '云端'}）</div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 ml-auto">
        {mode === 'cloud' && (
          <button
            onClick={() => onOpenCloudSettings?.()}
            className="rounded-lg p-2 hover:bg-white/5 border border-white/10"
            title="云端设置"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.274.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
        <button 
          onClick={(e) => {
            onToggleTheme?.(e.nativeEvent)
          }}
          className="rounded-lg p-2 hover:bg-white/5 border border-white/10"
          title={theme === 'dark' ? '切换浅色' : '切换深色'}
        >
          <span className="relative inline-flex h-4 w-4">
            <svg
              className="absolute inset-0 h-4 w-4 opacity-100 transition-all duration-300 ease-out dark:-rotate-180 dark:scale-75 dark:opacity-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
            <svg
              className="absolute inset-0 h-4 w-4 rotate-180 scale-75 opacity-0 transition-all duration-300 ease-out dark:rotate-0 dark:scale-100 dark:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          </span>
        </button>
        {onCreate && (
          <button
            onClick={() => {
              setRefreshSpin(true)
              window.setTimeout(() => setRefreshSpin(false), 520)
              onCreate?.()
            }}
            className="rounded-lg p-2 border border-white/10 text-blue-500 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
            title="刷新设备"
          >
            <svg
              className={`h-4 w-4 ${refreshSpin ? 'animate-[spin_0.5s_linear]' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
        {onAddDevice && (
          <button
            onClick={() => {
              setAddPop(true)
              window.setTimeout(() => setAddPop(false), 260)
              onAddDevice?.()
            }}
            className="rounded-lg p-2 border border-white/10 text-emerald-500 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
            title="添加设备"
          >
            <svg
              className={`h-4 w-4 transition-transform duration-300 ${addPop ? 'scale-110 rotate-6' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
