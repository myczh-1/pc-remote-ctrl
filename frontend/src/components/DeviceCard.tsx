import type { Device } from '../proto/home/service'

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
    <div className="card rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-green-500' : 'bg-gray-400'}`}></span>
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
        <pre className="bg-black/5 dark:bg-white/5 rounded-lg p-2 text-xs overflow-auto max-h-24">
          {JSON.stringify(device.state, null, 2)}
        </pre>
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
