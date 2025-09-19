import type { Device } from '../proto/home/service'
import { StatusIndicator } from './StatusIndicator'
import { StateRenderer } from './StateItem'

interface DeviceCardProps {
  device: Device
  onOpenDetail?: (device: Device) => void
  onQuickAction?: (device: Device, action: string) => void
  onEdit?: (device: Device) => void
}

export function DeviceCard({ device, onOpenDetail, onQuickAction, onEdit }: DeviceCardProps) {
  const online = device.online
  const quick = device.actions?.[0]?.name

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white/70 p-4 shadow-[0_8px_24px_rgba(15,21,32,0.12)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-prime-400/60 hover:shadow-[0_12px_36px_rgba(15,21,32,0.18)] dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_8px_24px_rgba(2,8,23,0.45)] dark:hover:shadow-[0_12px_40px_rgba(2,8,23,0.55)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIndicator online={online} />
          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[14rem]" title={device.name || device.id}>
            {device.name || device.id}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 text-xs rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => onEdit?.(device)}
          >编辑</button>
          <button
            className="px-2 py-1 text-xs rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => onOpenDetail?.(device)}
          >详情</button>
        </div>
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        <span className="mr-2">类型: {device.type || '-'}</span>
        <span>房间: {device.room || '-'}</span>
      </div>

      {!!device.state && (
        <div className="bg-black/5 dark:bg-white/5 rounded-lg p-2">
          <StateRenderer
            state={device.state}
            compact
            maxItems={3}
          />
        </div>
      )}

      <div className="mt-auto flex items-center gap-2">
        {quick && (
          <button
            disabled={!online}
            className="px-3 py-2 text-sm rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 disabled:opacity-50"
            onClick={() => onQuickAction?.(device, quick)}
          >{quick}</button>
        )}
        <button
          className="px-3 py-2 text-sm rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => onOpenDetail?.(device)}
        >更多操作</button>
      </div>
    </div>
  )
}
