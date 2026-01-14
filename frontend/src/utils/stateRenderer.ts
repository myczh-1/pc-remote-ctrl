export interface StateItem {
  key: string
  value: any
  type: StateType
  label: string
  formattedValue: string
  icon: string
  color: string
}

export type StateType =
  | 'temperature'
  | 'humidity'
  | 'power'
  | 'brightness'
  | 'battery'
  | 'signal'
  | 'percentage'
  | 'boolean'
  | 'number'
  | 'text'
  | 'unknown'

// 识别状态数据类型
export function detectStateType(key: string, value: any): StateType {
  const lowerKey = key.toLowerCase()

  // 温度相关
  if (lowerKey.includes('temp') || lowerKey === 'temperature') {
    return 'temperature'
  }

  // 湿度相关
  if (lowerKey.includes('humidity') || lowerKey.includes('humid')) {
    return 'humidity'
  }

  // 电源/开关状态
  if (lowerKey.includes('power') || lowerKey.includes('state') ||
      lowerKey === 'on' || lowerKey === 'off' || lowerKey === 'enabled') {
    return 'power'
  }

  // 亮度
  if (lowerKey.includes('bright') || lowerKey.includes('level') || lowerKey.includes('intensity')) {
    return 'brightness'
  }

  // 电池
  if (lowerKey.includes('battery') || lowerKey.includes('bat')) {
    return 'battery'
  }

  // 信号强度
  if (lowerKey.includes('signal') || lowerKey.includes('rssi') || lowerKey.includes('wifi')) {
    return 'signal'
  }

  // 基于数值判断
  if (typeof value === 'number') {
    // 0-100的数值通常是百分比
    if (value >= 0 && value <= 100 && Number.isInteger(value)) {
      return 'percentage'
    }
    return 'number'
  }

  // 布尔值
  if (typeof value === 'boolean' ||
      ['true', 'false', 'on', 'off', '1', '0'].includes(String(value).toLowerCase())) {
    return 'boolean'
  }

  // 文本
  if (typeof value === 'string') {
    return 'text'
  }

  return 'unknown'
}

// 格式化显示值
export function formatStateValue(type: StateType, value: any): string {
  const num = Number(value)
  const safeNum = Number.isFinite(num)
  switch (type) {
    case 'temperature':
      return safeNum ? `${num.toFixed(1)}°C` : '—'

    case 'humidity':
    case 'battery':
    case 'percentage':
      return safeNum ? `${Math.round(num)}%` : '—'

    case 'brightness':
      return safeNum ? `${Math.round(num)}%` : '—'

    case 'power':
    case 'boolean': {
      const boolValue = ['true', 'on', '1', 1, true].includes(value)
      return boolValue ? '开启' : '关闭'
    }

    case 'signal': {
      const signalValue = Number(value)
      if (signalValue > -30) return '极强'
      if (signalValue > -50) return '强'
      if (signalValue > -70) return '中等'
      if (signalValue > -90) return '弱'
      return '很弱'
    }

    case 'number':
      return safeNum ? num.toLocaleString() : '—'

    case 'text':
      return String(value)

    default:
      return JSON.stringify(value)
  }
}

// 获取状态项的图标
export function getStateIcon(type: StateType): string {
  switch (type) {
    case 'temperature': return '🌡️'
    case 'humidity': return '💧'
    case 'power': return '🔌'
    case 'brightness': return '💡'
    case 'battery': return '🔋'
    case 'signal': return '📶'
    case 'percentage': return '📊'
    case 'boolean': return '⚡'
    case 'number': return '🔢'
    case 'text': return '📝'
    default: return '❓'
  }
}

// 获取状态项的颜色
export function getStateColor(type: StateType, value: any): string {
  switch (type) {
    case 'temperature': {
      const temp = Number(value)
      if (temp > 30) return 'text-red-500'
      if (temp < 10) return 'text-blue-500'
      return 'text-green-500'
    }

    case 'humidity': {
      const humidity = Number(value)
      if (humidity > 70 || humidity < 30) return 'text-orange-500'
      return 'text-blue-500'
    }

    case 'power':
    case 'boolean': {
      const isOn = ['true', 'on', '1', 1, true].includes(value)
      return isOn ? 'text-green-500' : 'text-gray-400'
    }

    case 'battery': {
      const battery = Number(value)
      if (battery > 50) return 'text-green-500'
      if (battery > 20) return 'text-orange-500'
      return 'text-red-500'
    }

    case 'signal': {
      const signal = Number(value)
      if (signal > -50) return 'text-green-500'
      if (signal > -70) return 'text-orange-500'
      return 'text-red-500'
    }

    default:
      return 'text-slate-600 dark:text-slate-400'
  }
}

// 获取中文标签
export function getStateLabel(key: string, type: StateType): string {
  const lowerKey = key.toLowerCase()

  // 自定义映射
  const labelMap: Record<string, string> = {
    'temperature': '温度',
    'temp': '温度',
    'humidity': '湿度',
    'power': '电源',
    'state': '状态',
    'brightness': '亮度',
    'level': '等级',
    'battery': '电池',
    'signal': '信号',
    'rssi': '信号强度',
    'wifi': 'WiFi',
    'on': '开关',
    'enabled': '启用',
    'motion': '运动检测',
    'door': '门状态',
    'window': '窗户状态'
  }

  if (labelMap[lowerKey]) {
    return labelMap[lowerKey]
  }

  // 基于类型的默认标签
  switch (type) {
    case 'temperature': return '温度'
    case 'humidity': return '湿度'
    case 'power': return '电源'
    case 'brightness': return '亮度'
    case 'battery': return '电池'
    case 'signal': return '信号'
    default: return key
  }
}

interface FlattenedEntry {
  path: string
  leafKey: string
  parent?: string
  value: any
}

function isPlainObject(value: any): value is Record<string, any> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function unwrapProtoValue(value: any): any {
  if (!value || typeof value !== 'object') {
    return value
  }
  const kind = (value as any).kind
  if (kind && typeof kind === 'object') {
    switch (kind.oneofKind) {
      case 'stringValue':
        return kind.stringValue
      case 'numberValue':
        return kind.numberValue
      case 'boolValue':
        return kind.boolValue
      case 'listValue':
        return (kind.listValue?.values ?? []).map((v: any) => unwrapProtoValue(v))
      case 'structValue': {
        const fields = kind.structValue?.fields ?? {}
        const out: Record<string, any> = {}
        for (const [k, v] of Object.entries(fields)) {
          out[k] = unwrapProtoValue(v)
        }
        return out
      }
      default:
        return null
    }
  }
  if ('fields' in value && isPlainObject(value.fields)) {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value.fields)) {
      out[k] = unwrapProtoValue(v)
    }
    return out
  }
  return value
}

export function extractDesiredReported(state: any): { reported?: Record<string, any>; desired?: Record<string, any> } {
  const raw = unwrapProtoValue(state)
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  const reported = isPlainObject((raw as any).reported) ? (raw as any).reported : (isPlainObject(raw) ? raw : undefined)
  const desired = isPlainObject((raw as any).desired) ? (raw as any).desired : undefined
  return { reported: reported as Record<string, any> | undefined, desired: desired as Record<string, any> | undefined }
}

export function isDesiredSatisfied(desired?: Record<string, any>, reported?: Record<string, any>): boolean {
  if (!desired || Object.keys(desired).length === 0) {
    return true
  }
  if (!reported) {
    return false
  }
  for (const [k, v] of Object.entries(desired)) {
    if (!(k in reported)) {
      return false
    }
    const rv = (reported as any)[k]
    if (JSON.stringify(rv) !== JSON.stringify(v)) {
      return false
    }
  }
  return true
}

function flattenStateEntries(state: any): FlattenedEntry[] {
  const entries: FlattenedEntry[] = []
  const root = state && typeof state === 'object' && 'fields' in state ? state.fields : state

  const visit = (obj: any, prefix = '', depth = 0) => {
    if (!obj || typeof obj !== 'object') return
    const safeEntries = Object.entries(obj as Record<string, any>)
    for (const [key, raw] of safeEntries) {
      const path = prefix ? `${prefix}.${key}` : key
      const parent = prefix ? prefix.split('.').pop() : undefined
      const kind = (raw as any)?.kind
      if (kind?.oneofKind === 'structValue' && kind.structValue?.fields) {
        if (depth > 6) {
          entries.push({ path, leafKey: key, parent, value: {} })
        } else {
          visit(kind.structValue.fields, path, depth + 1)
        }
        continue
      }
      const actual = unwrapProtoValue(raw)
      if (isPlainObject(actual) && Object.keys(actual).length > 0 && depth <= 6) {
        visit(actual, path, depth + 1)
        continue
      }
      entries.push({ path, leafKey: key, parent, value: actual })
    }
  }

  if (isPlainObject(root)) {
    visit(root)
  }
  return entries
}

// 解析设备状态数据
export function parseDeviceState(state: any): StateItem[] {
  if (!state || typeof state !== 'object') {
    return []
  }

  const flattened = flattenStateEntries(state)
  if (!flattened.length) {
    return []
  }

  const items = flattened.map(entry => {
    const type = detectStateType(entry.leafKey, entry.value)
    const baseLabel = getStateLabel(entry.leafKey, type)
    const label = entry.parent ? `${entry.parent} · ${baseLabel}` : baseLabel
    const formattedValue = formatStateValue(type, entry.value)
    const icon = getStateIcon(type)
    const color = getStateColor(type, entry.value)
    return {
      key: entry.path,
      value: entry.value,
      type,
      label,
      formattedValue,
      icon,
      color,
    }
  })

  return items.sort((a, b) => {
    const priority: Record<string, number> = { power: 1, temperature: 2, humidity: 3, brightness: 4, battery: 5, signal: 6 }
    const aPriority = priority[a.type] || 99
    const bPriority = priority[b.type] || 99
    return aPriority - bPriority
  })
}
