import React from 'react'

interface DeviceFiltersProps {
  // 预留：仅 UI，不做实际过滤逻辑
}

export function DeviceFilters(_props: DeviceFiltersProps) {
  return (
    <aside className="w-full h-full min-h-0 flex flex-col gap-4 p-3 overflow-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] backdrop-blur-sm">
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">设备筛选</div>

      {/* 搜索 */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">搜索</label>
        <input
          type="text"
          placeholder="按名称/ID 搜索"
          className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/[0.06] outline-none focus:ring-2 focus:ring-prime-400/40"
        />
      </div>

      {/* 在线状态 */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-2">在线状态</label>
        <div className="flex gap-2">
          {[
            { id: 'all', label: '全部' },
            { id: 'online', label: '在线' },
            { id: 'offline', label: '离线' },
          ].map(btn => (
            <button key={btn.id} className="px-3 py-1.5 text-sm rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/[0.08]">
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* 标签（占位 UI） */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-2">标签</label>
        <div className="flex flex-wrap gap-2">
          {['电视', '灯光', '传感器', '客厅', '卧室'].map(tag => (
            <button key={tag} className="px-2.5 py-1 text-xs rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/[0.08]">
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* 房间（占位 UI，可选） */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">房间</label>
        <select className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/[0.06]">
          <option value="">全部</option>
          <option>客厅</option>
          <option>卧室</option>
          <option>厨房</option>
        </select>
      </div>

      {/* 重置（占位） */}
      <div className="mt-auto pt-2 border-t border-black/5 dark:border-white/5">
        <button className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/[0.08] text-sm">重置筛选</button>
      </div>
    </aside>
  )
}
