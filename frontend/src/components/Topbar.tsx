
interface TopbarProps {
  mode: 'local' | 'cloud'
  theme: 'light' | 'dark'
  onToggleTheme?: (e: MouseEvent) => void
  onCreate?: () => void // 刷新设备
  onAddDevice?: () => void // 添加设备
  onToggleMode?: () => void // 移动端：切换本地/云端
}

export function Topbar({ mode, theme, onToggleTheme, onCreate, onAddDevice, onToggleMode }: TopbarProps) {
  return (
    <header className="glass border-b border-black/10 dark:border-white/5 px-5 py-3 flex items-center gap-3">
      <div className="xl:hidden flex items-center gap-2 mr-2">
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
        <button 
          onClick={(e) => {
            onToggleTheme?.(e.nativeEvent)
          }}
          className="rounded-lg p-2 hover:bg-white/5 border border-white/10"
          title={theme === 'dark' ? '切换浅色' : '切换深色'}
        >
          <span className="theme-icon">
            {/* Sun */}
            <svg className="sun" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z"/></svg>
            {/* Moon */}
            <svg className="moon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          </span>
        </button>
        {onCreate && (
          <button
            onClick={onCreate}
            className="rounded-lg p-2 hover:bg-white/5 border border-white/10 text-blue-500 hover:text-blue-400 transition-colors"
            title="刷新设备"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
        {onAddDevice && (
          <button
            onClick={onAddDevice}
            className="rounded-lg p-2 hover:bg-white/5 border border-white/10 text-emerald-500 hover:text-emerald-400 transition-colors"
            title="添加设备"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
