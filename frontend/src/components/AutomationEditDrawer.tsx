import React, { useEffect, useState } from 'react'
import type { Automation } from '../proto/home/service'
import { Struct } from '../proto/google/protobuf/struct'

interface Props {
  open: boolean
  initial?: Automation
  onClose: () => void
  onSubmit: (automation: Automation) => Promise<void>
}

type WhenType = 'state' | 'event' | 'online' | 'action_result'

export function AutomationEditDrawer({ open, initial, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [whenType, setWhenType] = useState<WhenType>('state')
  const [whenDevice, setWhenDevice] = useState('')
  const [whenPath, setWhenPath] = useState('')
  const [whenEquals, setWhenEquals] = useState('')
  const [tags, setTags] = useState<string>('')
  const [actions, setActions] = useState<Array<{ deviceId: string; action: string; args: string }>>([{ deviceId: '', action: '', args: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!open) return
    setError('')
    setActionErrors({})
    if (initial) {
      setName(initial.name || '')
      setEnabled(Boolean(initial.enabled))
      const w = (initial.when as any) || {}
      setWhenType((w.type as WhenType) || 'state')
      setWhenDevice(w.device_id || '')
      setWhenPath(w.path || '')
      const eqVal = (w as any).equals
      setWhenEquals(String(eqVal ?? ''))
      setTags((initial.tags || []).join(','))
      setActions((initial.then || []).map(t => ({
        deviceId: t.deviceId || '',
        action: t.action || '',
        args: safeStringify(t.args),
      })).concat(initial.then && initial.then.length ? [] : [{ deviceId: '', action: '', args: '' }]))
    } else {
      setName('')
      setEnabled(true)
      setWhenType('state')
      setWhenDevice('')
      setWhenPath('')
      setWhenEquals('')
      setTags('')
      setActions([{ deviceId: '', action: '', args: '' }])
    }
  }, [open, initial])

  const setAction = (idx: number, field: 'deviceId' | 'action' | 'args', value: string) => {
    setActions(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a))
  }

  const addActionRow = () => setActions(prev => [...prev, { deviceId: '', action: '', args: '' }])
  const removeActionRow = (idx: number) => setActions(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    setError('')
    if (!name.trim()) { setError('名称必填'); return }
    if (!whenDevice.trim()) { setError('触发设备必填'); return }
    const validActions = actions.filter(a => a.deviceId.trim() && a.action.trim())
    if (!validActions.length) { setError('至少配置一个动作'); return }
    const newActionErrors: Record<number, string> = {}
    let parsedActions: Automation['then'] = []
    try {
      parsedActions = validActions.map((a, idx) => {
        try {
          const argsParsed = parseJSONOrEmpty(a.args)
          if (argsParsed !== undefined) {
            if (argsParsed === null || typeof argsParsed !== 'object' || Array.isArray(argsParsed)) {
              throw new Error('JSON 必须是对象')
            }
          }
          return {
            deviceId: a.deviceId.trim(),
            action: a.action.trim(),
            args: argsParsed ? Struct.fromJson(argsParsed) : undefined,
          }
        } catch (err: any) {
          newActionErrors[idx] = String(err?.message ?? err)
          throw err
        }
      })
    } catch (e: any) {
      setActionErrors(newActionErrors)
      setError(`动作参数需为 JSON 对象：${e?.message || e}`)
      return
    }
    setActionErrors({})
    if (whenPath.trim() && !whenEquals.trim()) {
      setError('触发路径已填，equals 也需填写（可填 JSON 值）')
      return
    }
    const when: any = { type: whenType, device_id: whenDevice.trim() }
    if (whenPath.trim()) when.path = whenPath.trim()
    if (whenEquals.trim()) {
      try {
        when.equals = JSON.parse(whenEquals)
      } catch {
        when.equals = whenEquals
      }
    }
    const whenStruct = Struct.fromJson(when)
    const automation: Automation = {
      id: initial?.id || '',
      name: name.trim(),
      enabled,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      when: whenStruct,
      then: parsedActions,
      updatedAt: initial?.updatedAt ?? '0',
    }
    try {
      setSaving(true)
      await onSubmit(automation)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`fixed inset-0 z-40 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}></div>
      <div className={`absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-[#0b1220] shadow-2xl transition-transform duration-300 flex flex-col overflow-hidden ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 border-b border-slate-200/70 dark:border-white/10 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">{initial ? '编辑自动化' : '新建自动化'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">配置触发条件与动作序列</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {error && <div className="text-sm text-red-500">{error}</div>}
          <div className="space-y-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">名称</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">标签（逗号分隔）</label>
            <input value={tags} onChange={e => setTags(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-600 dark:text-slate-300">触发条件</label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                启用
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={whenType} onChange={e => setWhenType(e.target.value as WhenType)} className="px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10">
                <option value="state">状态(state)</option>
                <option value="event">事件(event)</option>
                <option value="online">在线/离线(online)</option>
                <option value="action_result">动作回执(action_result)</option>
              </select>
              <input value={whenDevice} onChange={e => setWhenDevice(e.target.value)} placeholder="设备ID" className="px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={whenPath}
                onChange={e => setWhenPath(e.target.value)}
                placeholder="设备上报字段名，如 temperature"
                className="px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10"
              />
              <input
                value={whenEquals}
                onChange={e => setWhenEquals(e.target.value)}
                placeholder="期望值，可填 JSON 字符串/数值"
                className="px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10"
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              说明：payload 来自设备事件的 JSON 顶层字段，例如 state 上报 {`{"temperature":28}`}
              ，则 path=temperature，equals=28 时才会触发。
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600 dark:text-slate-300">动作序列</div>
              <button onClick={addActionRow} className="text-sm text-prime-600 hover:text-prime-700">+ 添加</button>
            </div>
            {actions.map((a, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200/60 dark:border-white/10 p-3 space-y-2 bg-white/60 dark:bg-white/[0.04]">
                <div className="grid grid-cols-2 gap-2">
                  <input value={a.deviceId} onChange={e => setAction(idx, 'deviceId', e.target.value)} placeholder="设备ID" className="px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10" />
                  <input value={a.action} onChange={e => setAction(idx, 'action', e.target.value)} placeholder="动作名称" className="px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10" />
                </div>
                <textarea value={a.args} onChange={e => setAction(idx, 'args', e.target.value)} placeholder='动作参数 JSON，如 {"k":"v"} (可选)' className="w-full px-3 py-2 rounded-lg bg-white/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 text-sm min-h-[72px]" />
                {a.args.trim() ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {actionErrors[idx] ? <span className="text-red-500">JSON 无效：{actionErrors[idx]}</span> : 'JSON 格式有效'}
                  </div>
                ) : null}
                {actions.length > 1 && (
                  <button onClick={() => removeActionRow(idx)} className="text-xs text-red-500 hover:underline">删除</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200/70 dark:border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/10 hover:bg-slate-200/80 dark:hover:bg-white/20">取消</button>
          <button
            disabled={saving}
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-prime-500 text-white hover:bg-prime-600 active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function parseJSONOrEmpty(txt: string): any {
  if (!txt.trim()) return undefined
  return JSON.parse(txt)
}

function safeStringify(v: any): string {
  if (!v) return ''
  try { return JSON.stringify(v, null, 2) } catch { return '' }
}
