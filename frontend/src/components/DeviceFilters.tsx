import React from 'react'

export type DeviceStatusFilter = 'all' | 'online' | 'offline'

interface DeviceFiltersProps {
  search: string
  status: DeviceStatusFilter
  room: string
  rooms: string[]
  availableTags: string[]
  selectedTags: string[]
  onSearchChange: (value: string) => void
  onStatusChange: (value: DeviceStatusFilter) => void
  onRoomChange: (value: string) => void
  onToggleTag: (tag: string) => void
  onReset: () => void
}

export function DeviceFilters({
  search,
  status,
  room,
  rooms,
  availableTags,
  selectedTags,
  onSearchChange,
  onStatusChange,
  onRoomChange,
  onToggleTag,
  onReset,
}: DeviceFiltersProps) {
  const statusButtons: Array<{ id: DeviceStatusFilter; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'online', label: '在线' },
    { id: 'offline', label: '离线' },
  ]

  return (
    <aside className="w-full h-full min-h-0 flex flex-col gap-4 p-3 overflow-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] backdrop-blur-sm">
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">设备筛选</div>

      {/* 搜索 */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">搜索</label>
        <input
          type="text"
          placeholder="按名称 / ID 搜索"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/[0.06] outline-none focus:ring-2 focus:ring-prime-400/40"
        />
      </div>

      {/* 在线状态 */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-2">在线状态</label>
        <div className="flex gap-2 flex-wrap">
          {statusButtons.map(btn => (
            <button
              key={btn.id}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                status === btn.id
                  ? 'border-prime-400 bg-prime-50 text-prime-600 dark:border-prime-400/40 dark:bg-prime-400/10 dark:text-prime-200'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/[0.08]'
              }`}
              onClick={() => onStatusChange(btn.id)}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* 标签 */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-2">标签</label>
        {availableTags.length === 0 ? (
          <div className="text-xs text-slate-400 dark:text-slate-500">暂无标签</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableTags.map(tag => {
              const active = selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  onClick={() => onToggleTag(tag)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    active
                      ? 'border-prime-400 bg-prime-500/10 text-prime-600 dark:border-prime-400/40 dark:text-prime-200'
                      : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  #{tag}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 房间 */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">房间</label>
        <select
          value={room}
          onChange={e => onRoomChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/[0.06]"
        >
          <option value="">全部</option>
          {rooms.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="mt-auto pt-2 border-t border-black/5 dark:border-white/5">
        <button
          className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/[0.08] text-sm"
          onClick={onReset}
        >
          重置筛选
        </button>
      </div>
    </aside>
  )
}
