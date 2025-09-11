interface Command {
  id: string;
  title: string;
  desc: string;
  icon: string;
}

interface CommandGridProps {
  commands: Command[];
  onRunCommand?: (commandId: string) => void;
  onConfigureCommand?: (commandId: string) => void;
  onMoreOptions?: (commandId: string) => void;
  onCreateCommand?: () => void;
}

const iconPaths: Record<string, string> = {
  'rotate-ccw': 'M1 4v6h6m16-6v6h-6M2 4a10 10 0 1014.17 6.162M22 4a10 10 0 11-14.17 6.162',
  'rocket': 'M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2z',
  'eraser': 'M12.57 5.43L18.57 11.43C19.35 12.21 19.35 13.46 18.57 14.24L14.24 18.57C13.46 19.35 12.21 19.35 11.43 18.57L5.43 12.57C4.65 11.79 4.65 10.54 5.43 9.76L9.76 5.43C10.54 4.65 11.79 4.65 12.57 5.43z',
  'terminal-square': 'M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm5 6l4 2-4 2v-4zm6 6h2',
  'database': 'M12 2C6.5 2 2 3.79 2 6s4.5 4 10 4 10-1.79 10-4-4.5-4-10-4zm0 4c-4.97 0-8-1.3-8-2s3.03-2 8-2 8 1.3 8 2-3.03 2-8 2zm0 4c-4.97 0-8-1.3-8-2V6.83c1.35.7 4.51 1.17 8 1.17s6.65-.47 8-1.17V8c0 .7-3.03 2-8 2z',
  'refresh-ccw': 'M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8'
};

function CommandIcon({ icon }: { icon: string }) {
  const path = iconPaths[icon] || iconPaths['terminal-square'];
  
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

export function CommandGrid({ 
  commands, 
  onRunCommand, 
  onConfigureCommand, 
  onMoreOptions,
  onCreateCommand 
}: CommandGridProps) {
  return (
    <section className="relative flex-1 overflow-auto px-5 py-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {commands.map(command => (
          <div key={command.id} className="card card-hover rounded-2xl p-4 border shadow-soft flex flex-col">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-prime-400/30 to-indigo-400/30 grid place-items-center">
                <CommandIcon icon={command.icon} />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{command.title}</div>
                <div className="text-sm text-slate-400">{command.desc}</div>
              </div>
              <button 
                onClick={() => onMoreOptions?.(command.id)}
                className="px-2 py-1 rounded-lg hover:bg-white/5 border border-white/10" 
                title="更多"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button 
                onClick={() => onRunCommand?.(command.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 text-slate-900 font-semibold px-3 py-2 hover:opacity-90"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-10-9h16M4 21h16" />
                </svg>
                运行
              </button>
              <button 
                onClick={() => onConfigureCommand?.(command.id)}
                className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                </svg>
                参数
              </button>
            </div>
          </div>
        ))}
        
        {/* Add Command Card */}
        <div 
          onClick={onCreateCommand}
          className="card card-hover rounded-2xl p-4 border shadow-soft flex flex-col items-center justify-center cursor-pointer min-h-[180px] border-dashed border-white/20 hover:border-prime-400/50"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-800/60 grid place-items-center mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="text-center">
            <div className="font-semibold text-slate-300">添加命令集</div>
            <div className="text-sm text-slate-500 mt-1">创建新的命令集</div>
          </div>
        </div>
      </div>
    </section>
  );
}