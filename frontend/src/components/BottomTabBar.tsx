import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

interface BottomTabBarProps {
  visible: boolean
  mode: 'local' | 'cloud'
  onChange?: (tab: 'refresh' | 'mode' | 'add' | 'settings' | 'logs') => void
  logsActive?: boolean
}

export function BottomTabBar({ visible, mode, onChange, logsActive }: BottomTabBarProps) {
  const prefersReduced = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.nav
          className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none"
          initial={prefersReduced ? false : { y: 40, opacity: 0, x: -10 }}
          animate={{ y: 0, opacity: 1, x: 0 }}
          exit={{ y: 40, opacity: 0, x: 10 }}
          transition={prefersReduced ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] as any }}
        >
          <div className="mx-auto max-w-screen-sm px-4 pb-3">
            <div className="pointer-events-auto mx-auto flex items-center justify-between gap-4 rounded-3xl border border-black/5 bg-gradient-to-r from-sky-400/20 to-fuchsia-400/20 px-3 py-2 shadow-lg backdrop-blur-xl backdrop-saturate-[1.4] dark:border-white/10 dark:from-white/[0.06] dark:to-white/[0.06]">
              {([
                { key: 'refresh', label: '刷新', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )},
                { key: 'logs', label: '日志', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )},
                { key: 'mode', label: (mode === 'cloud' ? '云端' : '本地'), icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 1018 0A9 9 0 003 12zm9-7v14m-7-7h14" />
                  </svg>
                )},
                { key: 'add', label: '添加', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
                  </svg>
                )},
                { key: 'settings', label: '设置', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94 1.543.826-3.31 2.37-2.37.996.607 2.274.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )},
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => onChange?.(t.key as any)}
                  className={`flex items-center justify-center p-1 transition-transform active:scale-95 ${
                    (t.key === 'mode' && mode === 'cloud') || (t.key === 'logs' && logsActive)
                      ? 'text-prime-600 dark:text-prime-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div
                    className={`grid place-items-center rounded-lg w-10 h-10 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${
                      (t.key === 'mode' && mode === 'cloud') || (t.key === 'logs' && logsActive)
                        ? 'bg-prime-500/10'
                        : ''
                    }`}
                  >
                    {t.icon}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  )
}
