interface LogEntry {
  text: string;
  type: 'info' | 'ok' | 'err';
  timestamp?: Date;
}

interface ConsoleProps {
  logs: LogEntry[];
  onClear?: () => void;
  onCopy?: () => void;
}

export function Console({ logs, onClear, onCopy }: ConsoleProps) {
  return (
    <section className="glass border-t border-black/10 dark:border-white/5 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>控制台输出</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onCopy}
            className="px-2 py-1 text-xs rounded-lg border border-white/10 hover:bg-white/5"
          >
            复制
          </button>
          <button 
            onClick={onClear}
            className="px-2 py-1 text-xs rounded-lg border border-white/10 hover:bg-white/5"
          >
            清空
          </button>
        </div>
      </div>
      <div className="h-52 overflow-auto rounded-xl bg-white/70 dark:bg-slate-950/70 border border-black/10 dark:border-white/5 p-3 font-mono text-sm leading-6 text-slate-900 dark:text-slate-100">
        <div className="whitespace-pre-wrap">
          {logs.map((log, index) => (
            <div key={index} className={`log-line ${log.type}`}>
              {log.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
