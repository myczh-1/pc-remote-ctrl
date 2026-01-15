import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { ActionSpec, Device } from '../proto/home/service'
import { DeviceCard } from '../components/DeviceCard'

interface DevicesPageProps {
  devices: Device[]
  layoutTransition: any
  onQuickAction: (device: Device, action: ActionSpec) => void
  onOpenDetail: (device: Device) => void
  onEdit: (device: Device) => void
  filtersPanel?: ReactNode
  showFilters?: boolean
}

export function DevicesPage({
  devices,
  layoutTransition,
  onQuickAction,
  onOpenDetail,
  onEdit,
  filtersPanel,
  showFilters = false,
}: DevicesPageProps) {
  return (
    <div className="flex gap-4 min-h-0">
      {showFilters && filtersPanel && (
        <div className="hidden lg:flex w-64 shrink-0">
          {filtersPanel}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="grid gap-3 justify-center content-start grid-cols-[repeat(auto-fit,minmax(320px,420px))]">
          {devices.map(d => (
            <motion.div key={d.id} layout transition={layoutTransition}>
              <DeviceCard
                device={d}
                onQuickAction={(dev, act) => onQuickAction(dev, act)}
                onOpenDetail={(dev) => onOpenDetail(dev)}
                onEdit={(dev) => onEdit(dev)}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
