interface ToolbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onFilter?: () => void;
  onCreateCommand?: () => void;
}

export function Toolbar({ activeTab, onTabChange, onFilter, onCreateCommand }: ToolbarProps) {
  const tabs = [
    { id: 'commands', label: '命令集' },
    { id: 'playbooks', label: 'Playbooks' },
    { id: 'history', label: '历史' }
  ];

  return (
    <div className="px-5 py-3 flex items-center gap-2 border-b border-white/5 bg-surface/60">
      <nav className="flex gap-2 text-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-1.5 rounded-lg border border-white/10 ${
              activeTab === tab.id 
                ? 'bg-white/5' 
                : 'hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      
      <div className="ml-auto flex items-center gap-2">
        <button 
          onClick={onFilter}
          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          过滤
        </button>
        <button 
          onClick={onCreateCommand}
          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建命令
        </button>
      </div>
    </div>
  );
}
