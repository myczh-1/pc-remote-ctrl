import React from 'react'
import type { StateItem as StateItemType } from '../utils/stateRenderer'
import { parseDeviceState } from '../utils/stateRenderer'

interface StateItemProps {
  item: StateItemType
  compact?: boolean
  showIcon?: boolean
  className?: string
}

export function StateItem({ item, compact = false, showIcon = true, className = '' }: StateItemProps) {
  if (compact) {
    // 紧凑模式：用于卡片显示
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        {showIcon && <span className="text-sm">{item.icon}</span>}
        <span className={`text-sm font-medium ${item.color}`}>
          {item.formattedValue}
        </span>
      </span>
    )
  }

  // 完整模式：用于详情页显示
  return (
    <div className={`flex items-center justify-between py-2 ${className}`}>
      <div className="flex items-center gap-2">
        {showIcon && <span className="text-base">{item.icon}</span>}
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {item.label}
        </span>
      </div>
      <span className={`text-sm font-medium ${item.color}`}>
        {item.formattedValue}
      </span>
    </div>
  )
}

interface StateListProps {
  items: StateItemType[]
  compact?: boolean
  maxItems?: number
  className?: string
}

export function StateList({ items, compact = false, maxItems, className = '' }: StateListProps) {
  const displayItems = maxItems ? items.slice(0, maxItems) : items
  const hasMore = maxItems && items.length > maxItems

  if (compact) {
    // 紧凑模式：水平排列
    return (
      <div className={`flex items-center gap-3  ${className}`}>
        {displayItems.map((item) => (
          <StateItem key={item.key} item={item} compact />
        ))}
        {hasMore && (
          <span className="text-xs text-slate-400">
            +{items.length - maxItems}项
          </span>
        )}
      </div>
    )
  }

  // 完整模式：垂直排列
  return (
    <div className={`space-y-1 ${className}`}>
      {displayItems.map((item) => (
        <StateItem key={item.key} item={item} />
      ))}
      {hasMore && (
        <div className="text-xs text-slate-400 text-center py-1">
          还有 {items.length - maxItems} 项...
        </div>
      )}
    </div>
  )
}

interface StateRendererProps {
  state: any
  compact?: boolean
  maxItems?: number
  className?: string
  showRawToggle?: boolean
}

export function StateRenderer({
  state,
  compact = false,
  maxItems,
  className = '',
  showRawToggle = false
}: StateRendererProps) {
  const [showRaw, setShowRaw] = React.useState(false)

  const items = parseDeviceState(state)
  // 在卡片（compact）模式下，隐藏未知类型条目，避免把 JSON 直接渲染在卡片上
  const renderedItems = compact ? items.filter(it => it.type !== 'unknown') : items

  if (!renderedItems.length) {
    return (
      <div className={`text-xs text-slate-400 ${className}`}>
        暂无状态数据
      </div>
    )
  }

  if (showRaw) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">原始数据</span>
          {showRawToggle && (
            <button
              onClick={() => setShowRaw(false)}
              className="text-xs text-blue-500 hover:text-blue-600"
            >
              美化显示
            </button>
          )}
        </div>
        <pre className="bg-black/5 dark:bg-white/5 rounded-lg p-2 text-xs overflow-auto max-h-48">
          {JSON.stringify(state, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <div className={className}>
      {showRawToggle && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">设备状态</span>
          <button
            onClick={() => setShowRaw(true)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            查看原始
          </button>
        </div>
      )}
      <StateList items={renderedItems} compact={compact} maxItems={maxItems} />
    </div>
  )
}
