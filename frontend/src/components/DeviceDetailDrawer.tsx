import type { Device, ActionSpec } from '../proto/home/service'
import { useMemo, useState, useEffect } from 'react'
import { DeviceStatus } from './StatusIndicator'
import { StateRenderer } from './StateItem'
import { Sheet, SheetContent } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'

interface DeviceDetailDrawerProps {
  open: boolean
  device?: Device
  initialActionName?: string
  onClose?: () => void
  onInvoke?: (deviceId: string, action: string, args: Record<string, any>) => void
  onEdit?: (device: Device) => void
  onDelete?: (device: Device) => void
}

export function DeviceDetailDrawer({ open, device, initialActionName, onClose, onInvoke, onEdit, onDelete }: DeviceDetailDrawerProps) {
  const [form, setForm] = useState<Record<string, any>>({})
  const actions = device?.actions ?? []
  const [selected, setSelected] = useState<ActionSpec | null>(actions[0] ?? null)

  const fields = useMemo(() => Object.entries(selected?.argsSchema ?? {}), [selected?.argsSchema])

  useEffect(() => {
    if (!device) {
      setSelected(null)
      setForm({})
      return
    }
    const preferred = initialActionName
      ? actions.find(a => a.name === initialActionName) || null
      : null
    const next = preferred ?? actions[0] ?? null
    setSelected(next)
    setForm({})
  }, [device?.id, initialActionName])

  if (!device) return null

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose?.()
      }}
    >
      <SheetContent
        side="right"
        className="w-[380px] max-w-[92vw] overflow-auto border-l border-black/10 bg-white/70 p-4 backdrop-blur-lg dark:border-white/10 dark:bg-white/[0.06]"
      >
        <div className="mb-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500 dark:text-slate-400">设备详情</div>
            <Button variant="ghost" className="rounded-lg p-2" onClick={onClose}>✕</Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 " title={device.name || device.id}>{device.name || device.id}</div>
            <Button variant="outline" className="shrink-0 rounded-lg px-3 py-1 text-xs" onClick={() => device && onEdit?.(device)}>编辑</Button>
            <Button
              variant="destructive"
              className="shrink-0 rounded-lg px-3 py-1 text-xs"
              onClick={() => device && onDelete?.(device)}
            >删除</Button>
          </div>
        </div>

        <div className="mb-3">
          <DeviceStatus
            online={device.online}
            lastSeen={device.lastSeen}
            className="mb-3"
          />
        </div>

        <div className="mb-3">
          <StateRenderer
            state={device.state}
            className="bg-black/5 dark:bg-white/5 rounded-lg p-3"
            showRawToggle
          />
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">动作</div>
          <Select
            className="mb-2"
            value={selected?.name ?? ''}
            onChange={(e) => {
              const act = actions.find(a => a.name === e.target.value) || null
              setSelected(act)
              setForm({})
            }}
          >
            {actions.map(a => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </Select>

          {fields.length > 0 ? (
            <div className="flex flex-col gap-2">
              {fields.map(([k, hint]) => (
                <div key={k} className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400">{k}</label>
                  <Input
                    placeholder={hint}
                    value={form[k] ?? ''}
                    onChange={(e) => setForm(prev => ({ ...prev, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 dark:text-slate-400">此动作无需参数</div>
          )}

          <Button
            className="mt-3 w-full px-3 py-2 text-sm rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700"
            onClick={() => selected && onInvoke?.(device.id, selected.name, form)}
            disabled={!selected}
          >执行 {selected?.name}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
