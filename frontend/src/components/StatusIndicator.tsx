interface StatusIndicatorProps {
  online: boolean
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
}

export function StatusIndicator({
  online,
  size = 'md',
  showText = false,
  className = ''
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3'
  }

  const colorClass = online ? 'bg-green-500' : 'bg-gray-400'
  const textClass = online ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'

  if (showText) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className={`${sizeClasses[size]} ${colorClass} rounded-full`}></div>
        <span className={`text-xs font-medium ${textClass}`}>
          {online ? '在线' : '离线'}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} ${colorClass} rounded-full ${className}`}
      title={online ? '设备在线' : '设备离线'}
    ></div>
  )
}

interface LastSeenProps {
  lastSeen: string | number
  className?: string
}

export function LastSeen({ lastSeen, className = '' }: LastSeenProps) {
  const getTimeAgo = (timestamp: string | number): string => {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
    if (!ts) return '从未'

    const now = Date.now()
    const diff = now - ts
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <span className={`text-xs text-slate-400 ${className}`}>
      最后活跃: {getTimeAgo(lastSeen)}
    </span>
  )
}

interface DeviceStatusProps {
  online: boolean
  lastSeen: string | number  // int64 from protobuf can be string
  showLastSeen?: boolean
  className?: string
}

export function DeviceStatus({
  online,
  lastSeen,
  showLastSeen = true,
  className = ''
}: DeviceStatusProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <StatusIndicator online={online} showText />
      {showLastSeen && <LastSeen lastSeen={lastSeen} />}
    </div>
  )
}