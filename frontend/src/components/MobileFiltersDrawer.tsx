import React, { useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

interface MobileFiltersDrawerProps {
  open: boolean
  onClose?: () => void
  children?: React.ReactNode
}

export function MobileFiltersDrawer({ open, onClose, children }: MobileFiltersDrawerProps) {
  const prefersReduced = useReducedMotion();
  const transition = useMemo(() => (
    prefersReduced ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] as any }
  ), [prefersReduced]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 遮罩层 */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onClose}
          />
          {/* 抽屉面板（从左侧滑入） */}
          <motion.aside
            className="fixed left-0 top-0 bottom-0 z-50 w-[88%] max-w-[22rem] bg-white dark:bg-[#0e1525] border-r border-black/10 dark:border-white/10 p-3 overflow-auto"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={transition}
          >
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
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

