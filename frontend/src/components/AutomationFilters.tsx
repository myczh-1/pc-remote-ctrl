import React from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface AutomationFiltersProps {
  name: string
  tag: string
  onNameChange: (value: string) => void
  onTagChange: (value: string) => void
  onReset: () => void
  variant?: 'panel' | 'plain'
}

export function AutomationFilters({ name, tag, onNameChange, onTagChange, onReset, variant = 'panel' }: AutomationFiltersProps) {
  const containerClass = variant === 'panel'
    ? 'w-full h-full min-h-0 flex flex-col gap-4 p-3 overflow-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] backdrop-blur-sm'
    : 'w-full h-full min-h-0 flex flex-col gap-4 p-1 overflow-auto'

  return (
    <aside className={containerClass}>
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">自动化筛选</div>

      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">名称</label>
        <Input
          placeholder="按名称搜索"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          className="h-10"
        />
      </div>

      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">标签</label>
        <Input
          placeholder="按标签过滤"
          value={tag}
          onChange={e => onTagChange(e.target.value)}
          className="h-10"
        />
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
