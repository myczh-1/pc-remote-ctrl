import { motion } from 'motion/react'
import type { ActionSpec, Device } from '../proto/home/service'
import { DeviceCard } from '../components/DeviceCard'

interface DevicesPageProps {
  devices: Device[]
  layoutTransition: any
  onQuickAction: (device: Device, action: ActionSpec) => void
  onOpenDetail: (device: Device) => void
  onEdit: (device: Device) => void
}

export function DevicesPage({ devices, layoutTransition, onQuickAction, onOpenDetail, onEdit }: DevicesPageProps) {
  return (
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
  )
}
