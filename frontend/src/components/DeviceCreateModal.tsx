import { useState } from 'react'
import type { Device } from '../proto/home/service'
import { AdapterKind } from '../proto/home/service'

interface DeviceCreateModalProps {
  open: boolean
  onCancel?: () => void
  onCreate?: (device: Device) => Promise<void> | void
  initialDevice?: Device
}

function parseArgsSchema(input: string): Record<string, string> {
  const out: Record<string, string> = {}
  input.split(/[;,\n]/).map(s => s.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf('=')
    if (idx > 0) {
      const k = pair.slice(0, idx).trim()
      const v = pair.slice(idx + 1).trim()
      if (k) out[k] = v
    } else {
      out[pair] = ''
    }
  })
  return out
}

export function DeviceCreateModal({ open, onCancel, onCreate, initialDevice }: DeviceCreateModalProps) {
  const [id, setId] = useState(initialDevice?.id ?? '')
  const [name, setName] = useState(initialDevice?.name ?? '')
  const [type, setType] = useState(initialDevice?.type ?? '')
  const [room, setRoom] = useState(initialDevice?.room ?? '')
  const [tags, setTags] = useState((initialDevice?.tags ?? []).join(','))
  const [adapterKind, setAdapterKind] = useState<AdapterKind>(initialDevice?.adapter?.kind ?? AdapterKind.MQTT)
  const [actions, setActions] = useState<Array<{ name: string; args: string; timeout: number }>>(
    (initialDevice?.actions ?? []).length > 0
      ? (initialDevice!.actions as any).map((a: any) => ({ name: a.name, args: Object.entries(a.argsSchema ?? {}).map(([k, v]) => `${k}=${v as string}`).join(';'), timeout: Number(a.timeoutMs ?? 2000) }))
      : [{ name: '', args: '', timeout: 2000 }]
  )
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const submit = async () => {
    if (!name && !id) return
    setSubmitting(true)
    const device: Device = {
      id: id,
      name,
      type,
      room,
      tags: tags.split(/[;,]/).map(s => s.trim()).filter(Boolean),
      online: false,
      lastSeen: 0 as any,
      topics: {},
      adapter: { kind: adapterKind, config: {} },
      actions: actions.filter(a => a.name.trim()).map(a => ({ name: a.name.trim(), argsSchema: parseArgsSchema(a.args), timeoutMs: a.timeout as any })),
      state: { fields: {} } as any,
    }
    try {
      await onCreate?.(device)
    } finally {
      setSubmitting(false)
    }
  }

  const addAction = () => setActions(prev => [...prev, { name: '', args: '', timeout: 2000 }])
  const removeAction = (i: number) => setActions(prev => prev.filter((_, idx) => idx !== i))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[560px] max-w-[92vw] rounded-2xl bg-white dark:bg-surface p-4 border border-black/10 dark:border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{initialDevice ? '编辑设备' : '添加设备'}</div>
          <button className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" onClick={onCancel}>✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-1">
            <label className="text-xs text-slate-500">设备 ID（可选）</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={id} onChange={e => setId(e.target.value)} placeholder="留空自动生成" />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-slate-500">名称</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={name} onChange={e => setName(e.target.value)} placeholder="例如：客厅灯" />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-slate-500">类型</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={type} onChange={e => setType(e.target.value)} placeholder="light/thermostat 等" />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-slate-500">房间</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={room} onChange={e => setRoom(e.target.value)} placeholder="living/bedroom 等" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500">标签（逗号分隔）</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={tags} onChange={e => setTags(e.target.value)} placeholder="tag1,tag2" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500">适配器</label>
            <select className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={adapterKind} onChange={e => setAdapterKind(Number(e.target.value) as AdapterKind)}>
              <option value={AdapterKind.MQTT}>MQTT</option>
              <option value={AdapterKind.SERIAL}>SERIAL</option>
              <option value={AdapterKind.HTTP}>HTTP</option>
            </select>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">动作列表</label>
            <button className="text-xs px-2 py-1 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5" onClick={addAction}>+ 添加动作</button>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {actions.map((a, i) => (
              <div key={i} className="grid grid-cols-6 gap-2 items-center">
                <input className="col-span-2 rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" placeholder="动作名，如 power" value={a.name} onChange={e => setActions(prev => prev.map((x, idx) => idx===i? {...x, name: e.target.value}: x))} />
                <input className="col-span-3 rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" placeholder="参数：k=v;mode=auto" value={a.args} onChange={e => setActions(prev => prev.map((x, idx) => idx===i? {...x, args: e.target.value}: x))} />
                <div className="col-span-1 flex items-center gap-2">
                  <input type="number" className="w-24 rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={a.timeout} onChange={e => setActions(prev => prev.map((x, idx) => idx===i? {...x, timeout: Number(e.target.value)}: x))} />
                  <button className="text-xs px-2 py-1 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5" onClick={() => removeAction(i)}>删</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5" onClick={onCancel}>取消</button>
          <button disabled={submitting} className="px-3 py-2 rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 disabled:opacity-50" onClick={submit}>{initialDevice ? '保存' : '创建'}</button>
        </div>
      </div>
    </div>
  )
}
