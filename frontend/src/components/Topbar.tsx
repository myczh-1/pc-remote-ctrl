
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
        {onAddDevice && (
          <button 
            onClick={onAddDevice}
            className="ml-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 px-3 py-2 shadow-soft border border-emerald-400/20"
          >
            添加设备
          </button>
        )}
        {onCreate && (
          <button 
            onClick={onCreate}
            className="ml-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 px-3 py-2 shadow-soft border border-prime-400/20"
          >
            刷新设备
          </button>
        )}
      </div>
    </header>
  );
}
