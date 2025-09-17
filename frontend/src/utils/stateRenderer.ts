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
  switch (type) {
    case 'temperature':
      return `${Number(value).toFixed(1)}°C`

    case 'humidity':
    case 'battery':
    case 'percentage':
      return `${Math.round(Number(value))}%`

    case 'brightness':
      return `${Math.round(Number(value))}%`

    case 'power':
    case 'boolean':
      const boolValue = ['true', 'on', '1', 1, true].includes(value)
      return boolValue ? '开启' : '关闭'

    case 'signal':
      const signalValue = Number(value)
      if (signalValue > -30) return '极强'
      if (signalValue > -50) return '强'
      if (signalValue > -70) return '中等'
      if (signalValue > -90) return '弱'
      return '很弱'

    case 'number':
      return Number(value).toLocaleString()

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
    case 'temperature':
      const temp = Number(value)
      if (temp > 30) return 'text-red-500'
      if (temp < 10) return 'text-blue-500'
      return 'text-green-500'

    case 'humidity':
      const humidity = Number(value)
      if (humidity > 70 || humidity < 30) return 'text-orange-500'
      return 'text-blue-500'

    case 'power':
    case 'boolean':
      const isOn = ['true', 'on', '1', 1, true].includes(value)
      return isOn ? 'text-green-500' : 'text-gray-400'

    case 'battery':
      const battery = Number(value)
      if (battery > 50) return 'text-green-500'
      if (battery > 20) return 'text-orange-500'
      return 'text-red-500'

    case 'signal':
      const signal = Number(value)
      if (signal > -50) return 'text-green-500'
      if (signal > -70) return 'text-orange-500'
      return 'text-red-500'

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

// 解析设备状态数据
export function parseDeviceState(state: any): StateItem[] {
  if (!state || typeof state !== 'object') {
    return []
  }

  const items: StateItem[] = []

  // 处理protobuf Struct格式
  const stateData = state.fields ? state.fields : state

  Object.entries(stateData).forEach(([key, value]) => {
    // 提取实际值（处理protobuf Value包装）
    let actualValue = value
    if (value && typeof value === 'object' && 'stringValue' in value) {
      actualValue = value.stringValue
    } else if (value && typeof value === 'object' && 'numberValue' in value) {
      actualValue = value.numberValue
    } else if (value && typeof value === 'object' && 'boolValue' in value) {
      actualValue = value.boolValue
    }

    const type = detectStateType(key, actualValue)
    const label = getStateLabel(key, type)
    const formattedValue = formatStateValue(type, actualValue)
    const icon = getStateIcon(type)
    const color = getStateColor(type, actualValue)

    items.push({
      key,
      value: actualValue,
      type,
      label,
      formattedValue,
      icon,
      color
    })
  })

  return items.sort((a, b) => {
    // 重要状态项排在前面
    const priority = { power: 1, temperature: 2, humidity: 3, brightness: 4, battery: 5, signal: 6 }
    const aPriority = priority[a.type] || 99
    const bPriority = priority[b.type] || 99
    return aPriority - bPriority
  })
}