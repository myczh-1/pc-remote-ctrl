import React from 'react'
import { Sheet, SheetContent } from './ui/sheet'

interface MobileFiltersDrawerProps {
  open: boolean
  onClose?: () => void
  children?: React.ReactNode
}

export function MobileFiltersDrawer({ open, onClose, children }: MobileFiltersDrawerProps) {
  if (!open) return null

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose?.()
      }}
    >
      <SheetContent side="left" className="p-3 bg-white/70 dark:bg-white/[0.06]">
        <div className="mb-2 -mx-1 -mt-1 flex items-center">
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/[0.06]" title="关闭">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="text-sm text-slate-600 dark:text-slate-300 ml-1">筛选</div>
        </div>
        <div>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
