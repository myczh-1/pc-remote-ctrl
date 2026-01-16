import React, { useEffect, useMemo, useState } from 'react'
import type { Automation, AutomationConditionKind, AutomationLogic, AutomationOperator, Device, DeviceModel } from '../proto/home/service'
import { AutomationConditionKind as ConditionKindEnum, AutomationLogic as LogicEnum, AutomationOperator as OpEnum } from '../proto/home/service'
import { Struct, Value } from '../proto/google/protobuf/struct'
import { Sheet, SheetContent } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Checkbox } from './ui/checkbox'

interface Props {
  open: boolean
  initial?: Automation
  devices?: Device[]
  models?: DeviceModel[]
  onClose: () => void
  onSubmit: (automation: Automation) => Promise<void>
}

type Logic = 'all' | 'any'

type ConditionKind = 'state' | 'online'

type Operator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'

type ConditionRow = {
  deviceId: string
  kind: ConditionKind
  path: string
  op: Operator
  value: string
}

type ActionRow = {
  deviceId: string
  action: string
  args: Record<string, string>
}

const DEFAULT_CONDITION: ConditionRow = {
  deviceId: '',
  kind: 'state',
  path: '',
  op: 'eq',
  value: '',
}

export function AutomationEditDrawer({ open, initial, devices = [], models = [], onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [logic, setLogic] = useState<Logic>('all')
  const [conditions, setConditions] = useState<ConditionRow[]>([{ ...DEFAULT_CONDITION }])
  const [tags, setTags] = useState<string>('')
  const [actions, setActions] = useState<ActionRow[]>([{ deviceId: '', action: '', args: {} }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const modelMap = useMemo(() => {
    const map = new Map<string, DeviceModel>()
    for (const model of models) {
      map.set(`${model.id}@${model.version}`, model)
    }
    return map
  }, [models])

  const deviceOptions = useMemo(() => {
    const opts = devices
      .map(d => {
        const key = d.modelId && d.modelVersion ? `${d.modelId}@${d.modelVersion}` : ''
        const hasModel = key ? modelMap.has(key) : false
        const label = d.name ? `${d.name} (${d.id})` : d.id
        return { id: d.id, label, hasModel }
      })
      .filter(d => d.hasModel)
      .sort((a, b) => a.label.localeCompare(b.label))
    return opts
  }, [devices, modelMap])

  const getModelForDevice = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId)
    if (!device?.modelId || !device?.modelVersion) return undefined
    return modelMap.get(`${device.modelId}@${device.modelVersion}`)
  }

  const getStateSchema = (deviceId: string) => {
    const model = getModelForDevice(deviceId)
    if (!model?.stateSchema) return {}
    return model.stateSchema
  }

  const getActionSpecs = (deviceId: string) => {
    const model = getModelForDevice(deviceId)
    return model?.actions || []
  }

  const getActionSchema = (deviceId: string, actionName: string) => {
    const action = getActionSpecs(deviceId).find(a => a.name === actionName)
    return action?.argsSchema || {}
  }

  useEffect(() => {
    if (!open) return
    setError('')
    if (initial) {
      setName(initial.name || '')
      setEnabled(Boolean(initial.enabled))
      setTags((initial.tags || []).join(','))
      const when = initial.when
      setLogic(logicFromPB(when?.logic))
      if (when?.conditions?.length) {
        setConditions(when.conditions.map(c => ({
          deviceId: c.deviceId || '',
          kind: kindFromPB(c.kind),
          path: c.path || '',
          op: opFromPB(c.op),
          value: valueToString(c.value),
        })))
      } else {
        setConditions([{ ...DEFAULT_CONDITION }])
      }
      if (initial.then?.length) {
        setActions(initial.then.map(act => ({
          deviceId: act.deviceId || '',
          action: act.action || '',
          args: structToStringMap(act.args),
        })))
      } else {
        setActions([{ deviceId: '', action: '', args: {} }])
      }
    } else {
      setName('')
      setEnabled(true)
      setLogic('all')
      setTags('')
      setConditions([{ ...DEFAULT_CONDITION }])
      setActions([{ deviceId: '', action: '', args: {} }])
    }
  }, [open, initial])

  const setCondition = (idx: number, field: keyof ConditionRow, value: string) => {
    setConditions(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const addConditionRow = () => setConditions(prev => [...prev, { ...DEFAULT_CONDITION }])

  const removeConditionRow = (idx: number) => setConditions(prev => prev.filter((_, i) => i !== idx))

  const setAction = (idx: number, field: 'deviceId' | 'action', value: string) => {
    setActions(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value, args: field === 'action' ? {} : a.args } : a))
  }

  const setActionArg = (idx: number, key: string, value: string) => {
    setActions(prev => prev.map((a, i) => i === idx ? { ...a, args: { ...a.args, [key]: value } } : a))
  }

  const addActionRow = () => setActions(prev => [...prev, { deviceId: '', action: '', args: {} }])
  const removeActionRow = (idx: number) => setActions(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    setError('')
    if (!name.trim()) { setError('名称必填'); return }
    if (!deviceOptions.length) { setError('设备未绑定模型，无法创建自动化'); return }
    if (!conditions.length) { setError('至少配置一个触发条件'); return }

    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i]
      if (!c.deviceId) { setError(`触发条件 ${i + 1} 未选择设备`); return }
      if (c.kind === 'state' && !c.path.trim()) { setError(`触发条件 ${i + 1} 未选择字段`); return }
      if (!c.value.trim()) { setError(`触发条件 ${i + 1} 未填写期望值`); return }
    }

    const validActions = actions.filter(a => a.deviceId.trim() && a.action.trim())
    if (!validActions.length) { setError('至少配置一个动作'); return }

    const missingModel = new Set<string>()
    for (const cond of conditions) {
      if (!getModelForDevice(cond.deviceId)) missingModel.add(cond.deviceId)
    }
    for (const act of validActions) {
      if (!getModelForDevice(act.deviceId)) missingModel.add(act.deviceId)
    }
    if (missingModel.size) {
      setError('存在未绑定模型的设备，无法保存')
      return
    }

    const whenConditions = conditions.map(c => {
      const valueType = c.kind === 'online'
        ? 'boolean'
        : inferValueType(getStateSchema(c.deviceId)[c.path])
      const parsed = parseValue(c.value, valueType)
      if (parsed === undefined) {
        throw new Error('触发条件的期望值类型不匹配')
      }
      return {
        deviceId: c.deviceId.trim(),
        kind: kindToPB(c.kind) as AutomationConditionKind,
        path: c.kind === 'online' ? '' : c.path.trim(),
        op: opToPB(c.op) as AutomationOperator,
        value: Value.fromJson(parsed),
      }
    })

    let parsedActions: Automation['then'] = []
    try {
      parsedActions = validActions.map((a) => {
        const schema = getActionSchema(a.deviceId, a.action)
        const argsObj: Record<string, any> = {}
        for (const [key, typeHint] of Object.entries(schema)) {
          const raw = a.args[key] ?? ''
          if (!raw.trim()) continue
          const parsed = parseValue(raw, inferValueType(typeHint))
          if (parsed === undefined) {
            throw new Error(`动作参数 ${key} 类型不匹配`)
          }
          argsObj[key] = parsed
        }
        return {
          deviceId: a.deviceId.trim(),
          action: a.action.trim(),
          args: Object.keys(argsObj).length ? Struct.fromJson(argsObj) : undefined,
        }
      })
    } catch (e: any) {
      setError(String(e?.message ?? e))
      return
    }

    const automation: Automation = {
      id: initial?.id || '',
      name: name.trim(),
      enabled,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      when: {
        logic: logicToPB(logic) as AutomationLogic,
        conditions: whenConditions,
      },
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

  if (!open) return null

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="w-full max-w-md p-0 bg-white/70 dark:bg-white/[0.06] flex flex-col overflow-hidden"
      >
        <div className="p-4 border-b border-slate-200/70 dark:border-white/10 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">{initial ? '编辑自动化' : '新建自动化'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">配置触发条件与动作序列</div>
          </div>
          <Button variant="ghost" onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white">✕</Button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {error && <div className="text-sm text-red-500">{error}</div>}
          <div className="space-y-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">名称</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">标签（逗号分隔）</label>
            <Input value={tags} onChange={e => setTags(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-600 dark:text-slate-300">触发条件</label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(Boolean(value))} />
                启用
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">条件满足</span>
              <Select value={logic} onChange={e => setLogic(e.target.value as Logic)} className="w-auto px-2 py-1 text-sm">
                <option value="all">全部 (AND)</option>
                <option value="any">任一 (OR)</option>
              </Select>
              <span className="text-xs text-slate-500">时触发</span>
            </div>
            <div className="space-y-3">
              {conditions.map((c, idx) => {
                const stateSchema = getStateSchema(c.deviceId)
                const statePaths = Object.keys(stateSchema || {}).sort()
                const valueType = c.kind === 'online'
                  ? 'boolean'
                  : inferValueType(stateSchema[c.path])
                const opOptions = c.kind === 'online'
                  ? ['eq', 'ne']
                  : ['eq', 'ne', 'gt', 'gte', 'lt', 'lte']
                return (
                  <div key={idx} className="rounded-xl border border-slate-200/60 dark:border-white/10 p-3 space-y-2 bg-white/60 dark:bg-white/[0.04]">
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={c.deviceId} onChange={e => setCondition(idx, 'deviceId', e.target.value)}>
                        <option value="">选择设备</option>
                        {deviceOptions.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </Select>
                      <Select value={c.kind} onChange={e => setCondition(idx, 'kind', e.target.value)}>
                        <option value="state">状态变化</option>
                        <option value="online">在线/离线</option>
                      </Select>
                    </div>
                    {c.kind === 'state' && (
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={c.path} onChange={e => setCondition(idx, 'path', e.target.value)}>
                          <option value="">选择字段</option>
                          {statePaths.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </Select>
                        <Select value={c.op} onChange={e => setCondition(idx, 'op', e.target.value)}>
                          {opOptions.map(op => (
                            <option key={op} value={op}>{op.toUpperCase()}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                    {c.kind === 'online' && (
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={c.op} onChange={e => setCondition(idx, 'op', e.target.value)}>
                          {opOptions.map(op => (
                            <option key={op} value={op}>{op.toUpperCase()}</option>
                          ))}
                        </Select>
                        <Select value={c.value} onChange={e => setCondition(idx, 'value', e.target.value)}>
                          <option value="true">在线</option>
                          <option value="false">离线</option>
                        </Select>
                      </div>
                    )}
                    {c.kind === 'state' && (
                      <div>
                        {valueType === 'boolean' && (
                          <Select value={c.value} onChange={e => setCondition(idx, 'value', e.target.value)}>
                            <option value="">选择期望值</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </Select>
                        )}
                        {valueType === 'number' && (
                          <Input type="number" value={c.value} onChange={e => setCondition(idx, 'value', e.target.value)} placeholder="期望值" />
                        )}
                        {valueType === 'string' && (
                          <Input value={c.value} onChange={e => setCondition(idx, 'value', e.target.value)} placeholder="期望值" />
                        )}
                      </div>
                    )}
                    {conditions.length > 1 && (
                      <Button variant="ghost" onClick={() => removeConditionRow(idx)} className="text-xs text-red-500 hover:underline">删除条件</Button>
                    )}
                  </div>
                )
              })}
              <Button variant="ghost" onClick={addConditionRow} className="text-sm text-prime-600 hover:text-prime-700">+ 添加条件</Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600 dark:text-slate-300">动作序列</div>
              <Button variant="ghost" onClick={addActionRow} className="text-sm text-prime-600 hover:text-prime-700">+ 添加</Button>
            </div>
            {actions.map((a, idx) => {
              const actionSpecs = getActionSpecs(a.deviceId)
              const schema = getActionSchema(a.deviceId, a.action)
              const argKeys = Object.keys(schema || {})
              return (
                <div key={idx} className="rounded-xl border border-slate-200/60 dark:border-white/10 p-3 space-y-2 bg-white/60 dark:bg-white/[0.04]">
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={a.deviceId} onChange={e => setAction(idx, 'deviceId', e.target.value)}>
                      <option value="">选择设备</option>
                      {deviceOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </Select>
                    <Select value={a.action} onChange={e => setAction(idx, 'action', e.target.value)} disabled={!a.deviceId}>
                      <option value="">选择动作</option>
                      {actionSpecs.map(action => (
                        <option key={action.name} value={action.name}>{action.name}</option>
                      ))}
                    </Select>
                  </div>
                  {argKeys.length ? (
                    <div className="space-y-2">
                      {argKeys.map(key => {
                        const typeHint = inferValueType(schema[key])
                        const val = a.args[key] ?? ''
                        if (typeHint === 'boolean') {
                          return (
                            <Select key={key} value={val} onChange={e => setActionArg(idx, key, e.target.value)}>
                              <option value="">{key}</option>
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </Select>
                          )
                        }
                        if (typeHint === 'number') {
                          return (
                            <Input key={key} type="number" value={val} onChange={e => setActionArg(idx, key, e.target.value)} placeholder={key} />
                          )
                        }
                        return (
                          <Input key={key} value={val} onChange={e => setActionArg(idx, key, e.target.value)} placeholder={key} />
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 dark:text-slate-400">该动作无参数</div>
                  )}
                  {actions.length > 1 && (
                    <Button variant="ghost" onClick={() => removeActionRow(idx)} className="text-xs text-red-500 hover:underline">删除</Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200/70 dark:border-white/10 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" className="px-4 py-2 rounded-lg">取消</Button>
          <Button
            disabled={saving}
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-prime-500 text-white hover:bg-prime-600 active:scale-[0.99]"
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function logicFromPB(v?: AutomationLogic): Logic {
  switch (v) {
    case LogicEnum.LOGIC_ANY:
      return 'any'
    default:
      return 'all'
  }
}

function logicToPB(v: Logic): AutomationLogic {
  return v === 'any' ? LogicEnum.LOGIC_ANY : LogicEnum.LOGIC_ALL
}

function kindFromPB(v?: AutomationConditionKind): ConditionKind {
  switch (v) {
    case ConditionKindEnum.CONDITION_ONLINE:
      return 'online'
    default:
      return 'state'
  }
}

function kindToPB(v: ConditionKind): AutomationConditionKind {
  return v === 'online' ? ConditionKindEnum.CONDITION_ONLINE : ConditionKindEnum.CONDITION_STATE
}

function opFromPB(v?: AutomationOperator): Operator {
  switch (v) {
    case OpEnum.OP_NE:
      return 'ne'
    case OpEnum.OP_GT:
      return 'gt'
    case OpEnum.OP_GTE:
      return 'gte'
    case OpEnum.OP_LT:
      return 'lt'
    case OpEnum.OP_LTE:
      return 'lte'
    default:
      return 'eq'
  }
}

function opToPB(v: Operator): AutomationOperator {
  switch (v) {
    case 'ne':
      return OpEnum.OP_NE
    case 'gt':
      return OpEnum.OP_GT
    case 'gte':
      return OpEnum.OP_GTE
    case 'lt':
      return OpEnum.OP_LT
    case 'lte':
      return OpEnum.OP_LTE
    default:
      return OpEnum.OP_EQ
  }
}

function inferValueType(hint?: string): 'string' | 'number' | 'boolean' {
  const v = (hint || '').toLowerCase()
  if (v.includes('bool')) return 'boolean'
  if (v.includes('int') || v.includes('float') || v.includes('double') || v.includes('number')) return 'number'
  return 'string'
}

function parseValue(raw: string, valueType: 'string' | 'number' | 'boolean'): any | undefined {
  if (valueType === 'boolean') {
    if (raw === 'true') return true
    if (raw === 'false') return false
    return undefined
  }
  if (valueType === 'number') {
    const num = Number(raw)
    if (Number.isFinite(num)) return num
    return undefined
  }
  return raw
}

function valueToString(value: Value | undefined): string {
  if (!value) return ''
  const json = Value.toJson(value)
  if (json === null || json === undefined) return ''
  if (typeof json === 'object') return JSON.stringify(json)
  return String(json)
}

function structToStringMap(st?: Struct): Record<string, string> {
  if (!st) return {}
  const json = Struct.toJson(st)
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(json)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') out[k] = JSON.stringify(v)
    else out[k] = String(v)
  }
  return out
}
