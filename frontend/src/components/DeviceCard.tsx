//
import type { Device, ActionSpec } from '../proto/home/service'
import { StatusIndicator, DeviceStatus } from './StatusIndicator'
import { StateRenderer } from './StateItem'
import { extractDesiredReported, isDesiredSatisfied } from '../utils/stateRenderer'
import { Card, CardContent, CardFooter, CardHeader } from './ui/card'

interface DeviceCardProps {
  device: Device
  onOpenDetail?: (device: Device) => void
  onQuickAction?: (device: Device, action: ActionSpec) => void
  onEdit?: (device: Device) => void
}

export function DeviceCard({ device, onOpenDetail, onQuickAction, onEdit: _onEdit }: DeviceCardProps) {
  const online = device.online
  const quickAction = device.actions?.[0]
  const { reported, desired } = extractDesiredReported(device.state)
  const desiredPending = desired && Object.keys(desired).length > 0 && !isDesiredSatisfied(desired, reported)
  // no emoji placeholder

  return (
    <Card
      className="w-full flex flex-col gap-2 rounded-2xl bg-white/70 p-3 shadow-[0_8px_24px_rgba(15,21,32,0.12)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-prime-400/60 hover:shadow-[0_12px_36px_rgba(15,21,32,0.18)] dark:bg-white/[0.06] dark:shadow-[0_8px_24px_rgba(2,8,23,0.45)] dark:hover:shadow-[0_12px_40px_rgba(2,8,23,0.55)] min-h-0"
      style={{ aspectRatio: '16 / 9' }}
    >
      <CardHeader className="p-0">
        <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusIndicator online={online} className="shrink-0" />
          <div className="truncate min-w-0">
            <div className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate" title={device.name || device.id}>
              {device.name || device.id}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              {device.type && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.06]">
                  {device.type}
                </span>
              )}
              {device.room && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.06]">
                  {device.room}
                </span>
              )}
              {desiredPending && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-300/70 bg-amber-100/70 text-amber-700">
                  目标未达成
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="relative flex items-center gap-2 flex-shrink-0">
          <button
            className="rounded-lg p-2 border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => onOpenDetail?.(device)}
            title="详情"
          >
            ⋯
          </button>
        </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 min-h-0 flex flex-col gap-2">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span className="truncate" />
          <DeviceStatus online={device.online} lastSeen={device.lastSeen} showLastSeen className="shrink-0" />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {device.state ? (
            <div className="h-full bg-black/5 dark:bg-white/5 rounded-lg p-2 overflow-auto">
              <StateRenderer
                state={device.state}
                compact
                maxItems={3}
              />
            </div>
          ) : (
            <div className="h-full rounded-lg border border-black/5 dark:border-white/5 bg-gradient-to-b from-black/[0.04] to-transparent dark:from-white/[0.04] dark:to-transparent flex flex-col items-center justify-center gap-1.5">
              <div className="text-[11px] text-slate-600 dark:text-slate-300">{device.type || '设备'}</div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">{online ? '在线' : '离线'}{device.room ? ` · ${device.room}` : ''}</div>
            </div>
          )}
        </div>
      </CardContent>

      {quickAction && (
        <CardFooter className="mt-auto pt-2 border-t border-black/5 dark:border-white/5 flex items-center gap-2">
          <button
            disabled={!online}
            className="px-3 py-2 text-sm rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 disabled:opacity-50"
            onClick={() => onQuickAction?.(device, quickAction)}
          >{quickAction.name}</button>
        </CardFooter>
      )}
    </Card>
  )
}
