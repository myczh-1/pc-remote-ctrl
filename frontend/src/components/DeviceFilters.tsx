import React from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'

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
  variant?: 'panel' | 'plain'
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
  variant = 'panel',
}: DeviceFiltersProps) {
  const statusButtons: Array<{ id: DeviceStatusFilter; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'online', label: '在线' },
    { id: 'offline', label: '离线' },
  ]

  const containerClass = variant === 'panel'
    ? 'w-full h-full min-h-0 flex flex-col gap-4 p-3 overflow-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] backdrop-blur-sm'
    : 'w-full h-full min-h-0 flex flex-col gap-4 p-1 overflow-auto'

  return (
    <aside className={containerClass}>
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">设备筛选</div>

      {/* 搜索 */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">搜索</label>
        <Input
          type="text"
          placeholder="按名称 / ID 搜索"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="h-10"
        />
      </div>

      {/* 在线状态 */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-2">在线状态</label>
        <div className="flex gap-2 flex-wrap">
          {statusButtons.map(btn => (
            <Button
              key={btn.id}
              variant="outline"
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                status === btn.id
                  ? 'border-prime-400 bg-prime-50 text-prime-600 dark:border-prime-400/40 dark:bg-prime-400/10 dark:text-prime-200'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/[0.08]'
              }`}
              onClick={() => onStatusChange(btn.id)}
            >
              {btn.label}
            </Button>
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
                <Button
                  key={tag}
                  onClick={() => onToggleTag(tag)}
                  variant="outline"
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    active
                      ? 'border-prime-400 bg-prime-500/10 text-prime-600 dark:border-prime-400/40 dark:text-prime-200'
                      : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  #{tag}
                </Button>
              )
            })}
          </div>
        )}
      </div>

      {/* 房间 */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">房间</label>
        <Select
          value={room}
          onChange={e => onRoomChange(e.target.value)}
          className="h-10"
        >
          <option value="">全部</option>
          {rooms.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>
      </div>

      <div className="mt-auto pt-2 border-t border-black/5 dark:border-white/5">
        <Button
          variant="outline"
          className="w-full px-3 py-2 rounded-lg text-sm"
          onClick={onReset}
        >
          重置筛选
        </Button>
      </div>
    </aside>
  )
}
