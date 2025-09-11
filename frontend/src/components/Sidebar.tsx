interface Device {
  id: string;
  name: string;
  online: boolean;
}

interface SidebarProps {
  devices: Device[];
  onAddDevice?: () => void;
}

export function Sidebar({ devices, onAddDevice }: SidebarProps) {
  const onlineCount = devices.filter(d => d.online).length;
  const offlineCount = devices.length - onlineCount;

  return (
    <aside className="w-[280px] hidden xl:flex flex-col gap-4 p-4 glass shadow-ring">
      <div className="flex items-center gap-2 px-2 pt-1">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-prime-400/70 to-indigo-400/70 grid place-items-center shadow-soft">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <div>
          <div className="text-sm uppercase tracking-widest text-slate-400">Console</div>
          <div className="font-semibold">PC Remote Control</div>
        </div>
      </div>

      <div className="mt-2">
        <div className="text-xs uppercase tracking-wider text-slate-400 px-2 mb-2">设备</div>
        <div className="flex flex-col gap-2">
          {devices.map(device => (
            <button 
              key={device.id}
              className="card card-hover w-full text-left rounded-xl px-3 py-2.5 border flex items-center gap-3"
            >
              <span className={`status-dot ${device.online ? 'status-on' : 'status-off'}`}></span>
              <span className="font-medium">{device.name}</span>
              <span className="ml-auto text-xs text-slate-400">{device.online ? '在线' : '离线'}</span>
            </button>
          ))}
        </div>
        <button 
          onClick={onAddDevice}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-white/5 py-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加设备
        </button>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <div className="card rounded-xl p-3">
          <div className="text-[11px] text-slate-400">Online</div>
          <div className="text-xl font-semibold">{onlineCount}</div>
        </div>
        <div className="card rounded-xl p-3">
          <div className="text-[11px] text-slate-400">Offline</div>
          <div className="text-xl font-semibold">{offlineCount}</div>
        </div>
      </div>
    </aside>
  );
}