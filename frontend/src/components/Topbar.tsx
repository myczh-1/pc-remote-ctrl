interface TopbarProps {
  onlineCount: number;
  queueCount: number;
  failCount: number;
  onRunAll?: () => void;
  onSearch?: (query: string) => void;
}

export function Topbar({ onlineCount, queueCount, failCount, onRunAll, onSearch }: TopbarProps) {
  return (
    <header className="glass border-b border-white/5 px-5 py-3 flex items-center gap-3">
      <div className="xl:hidden flex items-center gap-2 mr-2">
        <button className="rounded-lg p-2 hover:bg-white/5" title="Menu">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      
      <div className="relative flex-1 max-w-2xl">
        <input 
          placeholder="搜索命令 / 设备 / 历史…" 
          onChange={(e) => onSearch?.(e.target.value)}
          className="w-full rounded-xl bg-slate-900/60 border border-white/5 pl-10 pr-3 py-2 outline-none focus:ring-2 focus:ring-prime-400/40"
        />
        <svg className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      
      <div className="flex items-center gap-2 ml-auto">
        <span className="hidden md:inline-flex items-center gap-2 rounded-xl border border-white/5 px-3 py-1.5 bg-slate-900/60">
          <span className="status-dot status-on"></span>
          <span className="text-sm">在线 <b>{onlineCount}</b></span>
        </span>
        <span className="hidden md:inline-flex items-center gap-2 rounded-xl border border-white/5 px-3 py-1.5 bg-slate-900/60">
          <span className="status-dot status-idle"></span>
          <span className="text-sm">排队 <b>{queueCount}</b></span>
        </span>
        <span className="hidden md:inline-flex items-center gap-2 rounded-xl border border-white/5 px-3 py-1.5 bg-slate-900/60">
          <span className="status-dot status-off"></span>
          <span className="text-sm">失败 <b>{failCount}</b></span>
        </span>
        <button 
          onClick={onRunAll}
          className="ml-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-prime-400/80 to-indigo-400/80 hover:from-prime-400 hover:to-indigo-400 text-slate-900 font-semibold px-4 py-2 shadow-soft"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-10-9h16M4 21h16" />
          </svg>
          一键运行
        </button>
      </div>
    </header>
  );
}