import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

interface SidebarProps {
  mode?: 'local' | 'cloud';
  showLogs?: boolean;
  onToggleMode?: () => void;
  onRefreshDevices?: () => void;
  onConfigCloud?: () => void;
  onToggleLogs?: () => void;
  onAddDevice?: () => void;
}

// 简化版侧边栏：仅展示刷新 / 切换本地云端 / 设置 三个图标按钮
// 桌面（≥ lg）显示为固定窄栏；移动端隐藏（底部用 BottomTabBar 承载）
export function Sidebar({ mode = 'local', showLogs = false, onToggleMode, onRefreshDevices, onConfigCloud, onToggleLogs, onAddDevice }: SidebarProps) {
  const prefersReduced = useReducedMotion();
  const transition = useMemo(() => (
    prefersReduced ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as any }
  ), [prefersReduced]);

  const Btn: React.FC<React.PropsWithChildren<{ title: string; onClick?: () => void; active?: boolean }>> = ({ title, onClick, active, children }) => (
    <button
      onClick={onClick}
      className={`w-10 h-10 rounded-xl border grid place-items-center shadow transition-all active:scale-95 ${
        active
          ? 'border-prime-300/60 bg-prime-500/10 text-prime-600 dark:text-prime-400 dark:border-prime-300/30'
          : 'border-black/10 bg-white/70 hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.06]'
      }`}
      title={title}
    >
      {children}
    </button>
  );

  return (
    <motion.aside
      className="hidden lg:flex lg:flex-col items-center gap-3 overflow-hidden bg-white/60 px-2 py-3 backdrop-blur-sm backdrop-saturate-[1.2] dark:bg-surface-soft/60"
      initial={false}
      animate={{ width: 64 }}
      transition={transition}
    >
      <Btn title="刷新设备" onClick={onRefreshDevices}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </Btn>
      <Btn title="切换本地/云端" onClick={onToggleMode} active={mode === 'cloud'}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 1018 0A9 9 0 003 12zm9-7v14m-7-7h14" />
        </svg>
      </Btn>
      <Btn title="显示/隐藏日志" onClick={onToggleLogs} active={showLogs}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </Btn>
      <Btn title="添加设备" onClick={onAddDevice}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
        </svg>
      </Btn>
      <Btn title="设置" onClick={onConfigCloud}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.274.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </Btn>
    </motion.aside>
  );
}
