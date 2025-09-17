import type { Device, ActionSpec } from '../proto/home/service'
import { useMemo, useState } from 'react'
import { DeviceStatus } from './StatusIndicator'
import { StateRenderer } from './StateItem'

interface DeviceDetailDrawerProps {
  open: boolean
  device?: Device
  onClose?: () => void
  onInvoke?: (deviceId: string, action: string, args: Record<string, any>) => void
  onEdit?: (device: Device) => void
}

export function DeviceDetailDrawer({ open, device, onClose, onInvoke, onEdit }: DeviceDetailDrawerProps) {
  const [form, setForm] = useState<Record<string, any>>({})
  const actions = device?.actions ?? []
  const [selected, setSelected] = useState<ActionSpec | null>(actions[0] ?? null)

  const fields = useMemo(() => Object.entries(selected?.argsSchema ?? {}), [selected?.argsSchema])

  if (!open || !device) return null

  return (
    <aside className="fixed right-0 top-0 bottom-0 w-[380px] bg-white dark:bg-surface-soft border-l border-black/10 dark:border-white/10 p-4 overflow-auto z-40">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">设备详情</div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{device.name || device.id}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-lg px-3 py-1 text-xs border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5" onClick={() => device && onEdit?.(device)}>编辑</button>
          <button className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" onClick={onClose}>✕</button>
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
        <select
          className="w-full mb-2 rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1"
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
        </select>

        {fields.length > 0 ? (
          <div className="flex flex-col gap-2">
            {fields.map(([k, hint]) => (
              <div key={k} className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">{k}</label>
                <input
                  className="rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1"
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

        <button
          className="mt-3 w-full px-3 py-2 text-sm rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700"
          onClick={() => selected && onInvoke?.(device.id, selected.name, form)}
          disabled={!selected}
        >执行 {selected?.name}</button>
      </div>
    </aside>
  )
}
