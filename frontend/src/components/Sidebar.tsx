import { useEffect, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

interface Device { id: string; name: string; online: boolean }
interface SidebarProps {
  devices: Device[];
  onAddDevice?: () => void;
  isOpen?: boolean;          // 移动端抽屉开关
  onClose?: () => void;      // 点击蒙层/ESC 关闭
}

/** 侧边栏内容（桌面与移动端复用，避免重复 JSX） */
function SidebarContent({
                          devices, onAddDevice, onClose
                        }: { devices: Device[]; onAddDevice?: () => void; onClose?: () => void }) {
  const prefersReduced = useReducedMotion();
  const listItemTransition = useMemo(() => (
    prefersReduced ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as any }
  ), [prefersReduced]);
  // 列表项动画过渡在 SidebarContent 内部计算，避免跨作用域引用
  const online = devices.filter(d => d.online).length;
  const offline = devices.length - online;

  return (
      <>
        <div className="flex items-center gap-2 px-2 pt-1 w-full">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-prime-400/70 to-indigo-400/70 grid place-items-center shadow-soft">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/>
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm uppercase tracking-widest text-slate-400">Console</div>
            <div className="font-semibold">PC Remote Control</div>
          </div>
          {onClose && (
              <button
                  className="xl:hidden inline-flex size-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={onClose}
                  aria-label="关闭侧边栏"
              >✕</button>
          )}
        </div>

        <div className="mt-2 w-full">
          <div className="text-xs uppercase tracking-wider text-slate-400 px-2 mb-2">设备</div>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {devices.map(d => (
                  <motion.li
                      key={d.id}
                      layout
                      initial={prefersReduced ? false : { opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={listItemTransition}
                  >
                    <button className="card card-hover w-full text-left rounded-xl px-3 py-2.5 border flex items-center gap-3">
                      <span className={`status-dot ${d.online ? 'status-on' : 'status-off'}`} />
                      <span className="font-medium">{d.name}</span>
                      <span className="ml-auto text-xs text-slate-400">{d.online ? '在线' : '离线'}</span>
                    </button>
                  </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          <button
              onClick={onAddDevice}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-white/5 py-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加设备
          </button>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 w-full">
          <div className="card rounded-xl p-3">
            <div className="text-[11px] text-slate-400">Online</div>
            <div className="text-xl font-semibold">{online}</div>
          </div>
          <div className="card rounded-xl p-3">
            <div className="text-[11px] text-slate-400">Offline</div>
            <div className="text-xl font-semibold">{offline}</div>
          </div>
        </div>
      </>
  );
}

export function Sidebar({ devices, onAddDevice, isOpen = false, onClose }: SidebarProps) {
  const prefersReduced = useReducedMotion();
  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // 锁定滚动（移动端抽屉开启时）
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  const drawerTransition = useMemo(() => (
    prefersReduced ? { duration: 0 } : { type: "spring" as const, bounce: 0, duration: 0.32 }
  ), [prefersReduced]);

  

  return (
      <>
        {/* 移动端蒙层 */}
        <AnimatePresence initial={false}>
          {isOpen && (
              <motion.div
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] xl:hidden"
                  initial={prefersReduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={prefersReduced ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
                  onClick={onClose}
                  aria-hidden="true"
              />
          )}
        </AnimatePresence>

        {/* 移动端抽屉 */}
        <AnimatePresence initial={false}>
          {isOpen && (
              <motion.aside
                  className="fixed inset-y-0 left-0 w-[280px] z-50 xl:hidden bg-white dark:bg-surface-soft border-r border-black/10 dark:border-white/10 glass will-change-transform transform-gpu"
                  initial={prefersReduced ? false : { x: -288, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -288, opacity: 0 }}
                  transition={drawerTransition}
                  drag={prefersReduced ? false : 'x'}
                  dragDirectionLock
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={{ left: 0.08, right: 0 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -80) onClose?.();
                  }}
                  role="dialog" aria-modal
              >
                <SidebarContent devices={devices} onAddDevice={onAddDevice} onClose={onClose} />
              </motion.aside>
          )}
        </AnimatePresence>

        {/* 桌面版（云端模式，宽度过渡，联动主内容） */}
        <motion.aside
          className="hidden xl:block overflow-hidden glass bg-white dark:bg-surface-soft border-r border-black/10 dark:border-white/10 will-change-transform transform-gpu"
          initial={false}
          animate={{ width: isOpen ? 280 : 0 }}
          transition={drawerTransition}
          aria-hidden={!isOpen}
        >
          <motion.div
            className="flex flex-col gap-4 p-4 w-[280px]"
            initial={false}
            animate={prefersReduced ? { opacity: 1, x: 0 } : { opacity: isOpen ? 1 : 0, x: isOpen ? 0 : -8 }}
            transition={drawerTransition}
            style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
          >
            <SidebarContent devices={devices} onAddDevice={onAddDevice} />
          </motion.div>
        </motion.aside>
      </>
  );
}
