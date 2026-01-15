import { useEffect, useMemo, useState } from 'react'
import type { DeviceModel, DeviceModelSpec, ActionSpec } from '../proto/home/service'

interface DeviceModelModalProps {
  open: boolean
  initialModel?: DeviceModel
  onCancel: () => void
  onSubmit: (model: DeviceModelSpec) => Promise<void> | void
}

function stringify(value: any, fallback: string) {
  try {
    return JSON.stringify(value ?? null, null, 2)
  } catch {
    return fallback
  }
}

function parseJson<T>(input: string, fallback: T): T {
  const trimmed = input.trim()
  if (!trimmed) return fallback
  return JSON.parse(trimmed) as T
}

function normalizeStringMap(input: any): Record<string, string> {
  const out: Record<string, string> = {}
  if (!input || typeof input !== 'object') return out
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue
    out[String(k)] = String(v)
  }
  return out
}

function normalizeActions(input: any): ActionSpec[] {
  if (!Array.isArray(input)) return []
  return input.map((item: any) => ({
    name: String(item?.name ?? ''),
    argsSchema: normalizeStringMap(item?.argsSchema ?? item?.args_schema),
    timeoutMs: Number(item?.timeoutMs ?? item?.timeout_ms ?? 0) || 0,
  })).filter(a => a.name)
}

export function DeviceModelModal({ open, initialModel, onCancel, onSubmit }: DeviceModelModalProps) {
  const [id, setId] = useState(initialModel?.id ?? '')
  const [version, setVersion] = useState(initialModel?.version ?? '')
  const [name, setName] = useState(initialModel?.name ?? '')
  const [description, setDescription] = useState(initialModel?.description ?? '')
  const [tags, setTags] = useState((initialModel?.tags ?? []).join(','))
  const [actions, setActions] = useState(stringify(initialModel?.actions, '[]'))
  const [stateSchema, setStateSchema] = useState(stringify(initialModel?.stateSchema, '{}'))
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialModel) {
      setId(initialModel.id ?? '')
      setVersion(initialModel.version ?? '')
      setName(initialModel.name ?? '')
      setDescription(initialModel.description ?? '')
      setTags((initialModel.tags ?? []).join(','))
      setActions(stringify(initialModel.actions, '[]'))
      setStateSchema(stringify(initialModel.stateSchema, '{}'))
    } else {
      setId('')
      setVersion('')
      setName('')
      setDescription('')
      setTags('')
      setActions('[]')
      setStateSchema('{}')
    }
    setError('')
  }, [initialModel, open])

  const isEdit = Boolean(initialModel)
  const title = isEdit ? '编辑设备模型' : '新建设备模型'
  const actionHint = useMemo(() => (
    `[
  {"name": "power", "argsSchema": {"on": "boolean"}, "timeoutMs": 2000}
]`
  ), [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[720px] max-w-[92vw] max-h-[92vh] overflow-auto rounded-2xl bg-white dark:bg-surface p-4 border border-black/10 dark:border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{title}</div>
          <button className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" onClick={onCancel}>✕</button>
        </div>

        {error && <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">模型 ID</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={id} onChange={e => setId(e.target.value)} placeholder="如 led-1" disabled={isEdit} />
          </div>
          <div>
            <label className="text-xs text-slate-500">版本</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={version} onChange={e => setVersion(e.target.value)} placeholder="如 v1" disabled={isEdit} />
          </div>
          <div>
            <label className="text-xs text-slate-500">名称</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={name} onChange={e => setName(e.target.value)} placeholder="如 LED 灯" />
          </div>
          <div>
            <label className="text-xs text-slate-500">标签（逗号分隔）</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={tags} onChange={e => setTags(e.target.value)} placeholder="light,led" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500">描述</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={description} onChange={e => setDescription(e.target.value)} placeholder="描述用途/协议" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500">动作列表 Actions（JSON）</label>
            <textarea className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 h-32 font-mono text-xs" value={actions} onChange={e => setActions(e.target.value)} placeholder={actionHint} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500">状态字段 Schema（JSON）</label>
            <textarea className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 h-20 font-mono text-xs" value={stateSchema} onChange={e => setStateSchema(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5" onClick={onCancel}>取消</button>
          <button
            className="px-3 py-2 rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700"
            onClick={async () => {
              setError('')
              if (!id.trim() || !version.trim() || !name.trim()) {
                setError('模型 ID / 版本 / 名称不能为空')
                return
              }
              try {
                const parsedActions = parseJson(actions, [])
                if (!Array.isArray(parsedActions)) {
                  throw new Error('动作列表必须是 JSON 数组')
                }
                const parsedSchema = parseJson(stateSchema, {})
                if (!parsedSchema || typeof parsedSchema !== 'object' || Array.isArray(parsedSchema)) {
                  throw new Error('状态字段必须是 JSON 对象')
                }
                const model: DeviceModelSpec = {
                  id: id.trim(),
                  version: version.trim(),
                  name: name.trim(),
                  description: description.trim(),
                  tags: tags.split(/[;,]/).map(s => s.trim()).filter(Boolean),
                  actions: normalizeActions(parsedActions),
                  stateSchema: normalizeStringMap(parsedSchema),
                } as DeviceModelSpec
                const sanitized = JSON.parse(JSON.stringify(model)) as DeviceModelSpec
                await onSubmit(sanitized)
              } catch (e: any) {
                const msg = String(e?.stack || e?.message || e)
                setError(msg)
                try { console.error(e) } catch {}
              }
            }}
          >
            {isEdit ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
