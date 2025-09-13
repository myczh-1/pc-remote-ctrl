import { WorkflowList } from './CommandSetList'
import type { CommandSet, CommandSetExecution } from '../types'

interface CommandPanelProps {
  commandSets: CommandSet[]
  loading: boolean
  isRunning: boolean
  execution: CommandSetExecution | null
  mode: 'local' | 'cloud'
  selectedDeviceId?: string
  availableDevices?: Array<{id: string; name: string; online: boolean}>
  onRefresh: () => Promise<void>
  onExecute: (commandSet: CommandSet) => Promise<void>
  onEdit: (commandSet: CommandSet) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => Promise<void>
  onSelectDevice?: (deviceId: string) => void
}

export function CommandPanel({
  commandSets,
  loading,
  isRunning,
  execution,
  mode,
  selectedDeviceId,
  availableDevices = [],
  onRefresh,
  onExecute,
  onEdit,
  onDelete,
  onDuplicate,
  onSelectDevice: _onSelectDevice,
}: CommandPanelProps) {
  return (
    <div className="card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {mode === 'local' ? '本地命令集' : '云端命令集'}
        </h2>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 text-sm border border-black/10 dark:border-white/10 rounded-lg bg-white/50 dark:bg-card hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 text-slate-900 dark:text-slate-100"
            disabled={loading || isRunning}
            onClick={onRefresh}
            title={mode === 'local' ? '刷新命令集列表' : '刷新设备列表'}
          >
            刷新
          </button>
        </div>
      </div>

      {mode === 'cloud' && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                当前模式：云端控制
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {selectedDeviceId ? (
                  <>选中设备：{availableDevices.find(d => d.id === selectedDeviceId)?.name || selectedDeviceId}</>
                ) : (
                  <>请在左侧选择要控制的设备</>
                )}
              </div>
            </div>
            {selectedDeviceId && (
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  availableDevices.find(d => d.id === selectedDeviceId)?.online ? 'bg-green-500' : 'bg-red-500'
                }`}></span>
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  {availableDevices.find(d => d.id === selectedDeviceId)?.online ? '在线' : '离线'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'cloud' && !selectedDeviceId ? (
        <div className="text-center py-10 text-slate-600 dark:text-slate-400">
          <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <h3 className="text-base font-medium text-slate-900 dark:text-slate-100 mb-2">选择设备</h3>
          <p className="text-sm mb-4">请在左侧设备列表中选择要控制的远程设备</p>
          {availableDevices.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              暂无可用设备，请检查云端服务器连接或设备注册状态
            </p>
          )}
        </div>
      ) : commandSets.length === 0 && !loading ? (
        <div className="text-center py-10 text-slate-600 dark:text-slate-400">
          <h3 className="text-base font-medium text-slate-900 dark:text-slate-100">
            {mode === 'local' ? '还没有命令集' : '暂无命令集'}
          </h3>
          {mode === 'local' && (
            <p className="text-sm mt-2">点击右上角的"新建命令集"开始创建</p>
          )}
        </div>
      ) : (commandSets.length > 0 || loading) && (mode === 'local' || selectedDeviceId) ? (
        <WorkflowList 
          workflows={commandSets}
          onExecuteWorkflow={onExecute}
          onEditWorkflow={onEdit}
          onDeleteWorkflow={onDelete}
          onDuplicateWorkflow={onDuplicate}
          executingWorkflowId={execution?.status === 'running' ? execution.commandSetId : undefined}
        />
      ) : null}
    </div>
  )
}
