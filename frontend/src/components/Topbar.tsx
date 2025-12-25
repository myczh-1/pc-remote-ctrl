import { useState } from 'react'

interface TopbarProps {
  mode: 'local' | 'cloud'
  theme: 'light' | 'dark'
  onToggleTheme?: (e: MouseEvent) => void
  onToggleFullscreen?: () => void // 全屏/退出全屏
  onExit?: () => void // 退出按钮（按需占位）
  onOpenFilters?: () => void // 移动端：打开筛选抽屉
}

export function Topbar({ mode, theme, onToggleTheme, onToggleFullscreen, onExit, onOpenFilters }: TopbarProps) {
  const [_refreshSpin, _setRefreshSpin] = useState(false)
  const [_addPop, _setAddPop] = useState(false)
  return (
    <header className="flex items-center gap-3 border-b border-black/10 bg-white/60 px-5 py-3 backdrop-blur-md backdrop-saturate-[1.4] transition-colors dark:border-white/5 dark:bg-white/[0.08]">
      <div className="flex items-center gap-2 mr-2">
        {/* 移动端：汉堡按钮，打开筛选抽屉 */}
        <button
          onClick={onOpenFilters}
          className="md:hidden rounded-lg p-2 hover:bg-white/5 border border-white/10"
          title="筛选"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
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
        {/* 全屏按钮 */}
        <button
          onClick={onToggleFullscreen}
          className="rounded-lg p-2 hover:bg-white/5 border border-white/10"
          title="切换全屏"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3" />
          </svg>
        </button>
        {/* 退出按钮（功能留空） */}
        <button
          onClick={onExit}
          className="rounded-lg p-2 hover:bg-white/5 border border-white/10"
          title="退出"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6a2 2 0 012-2h6a2 2 0 012 2v2" />
          </svg>
        </button>
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
      </div>
    </header>
  );
}
