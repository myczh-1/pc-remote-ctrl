import { WorkflowList } from './CommandSetList'
import type { CommandSet, CommandSetExecution } from '../types'

interface CommandPanelProps {
  commandSets: CommandSet[]
  loading: boolean
  isRunning: boolean
  execution: CommandSetExecution | null
  onRefresh: () => Promise<void>
  onCreate: () => void
  onExecute: (commandSet: CommandSet) => Promise<void>
  onEdit: (commandSet: CommandSet) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => Promise<void>
  onCreateSample: () => Promise<void>
  // Cloud mode additions (optional)
  mode?: 'local' | 'cloud'
  onModeChange?: (mode: 'local' | 'cloud') => void
  cloudDevices?: { deviceId: string; name: string; status?: string }[]
  selectedDeviceId?: string
  onSelectDevice?: (deviceId: string) => void
  cloudLoading?: boolean
}

export function CommandPanel({
  commandSets,
  loading,
  isRunning,
  execution,
  onRefresh,
  onCreate,
  onExecute,
  onEdit,
  onDelete,
  onDuplicate,
  onCreateSample,
  mode = 'local',
  onModeChange,
  cloudDevices = [],
  selectedDeviceId,
  onSelectDevice,
  cloudLoading = false,
}: CommandPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">命令集</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">模式</label>
            <select
              value={mode}
              onChange={e => onModeChange?.(e.target.value as 'local' | 'cloud')}
              className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
            >
              <option value="local">本地</option>
              <option value="cloud">云端</option>
            </select>
            {mode === 'cloud' && (
              <>
                <label className="text-xs text-gray-600">设备</label>
                <select
                  value={selectedDeviceId ?? ''}
                  onChange={e => onSelectDevice?.(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
                >
                  <option value="" disabled>选择设备</option>
                  {cloudDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.name || d.deviceId}{d.status ? ` (${d.status})` : ''}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <button
            className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60"
            disabled={loading || isRunning}
            onClick={onRefresh}
            title="刷新命令集列表"
          >
            刷新
          </button>
          <button
            className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={onCreate}
            disabled={isRunning}
          >
            新建命令集
          </button>
        </div>
      </div>

      {commandSets.length === 0 && !loading ? (
        <div className="text-center py-10 text-gray-600">
          <h3 className="text-base font-medium text-gray-900 mb-1">还没有命令集</h3>
          <p className="text-sm mb-4">创建第一个命令集来开始远程控制</p>
          <button 
            className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60" 
            onClick={onCreateSample}
            disabled={loading || isRunning}
          >
            创建示例命令集
          </button>
        </div>
      ) : (
        <WorkflowList 
          workflows={commandSets}
          onExecuteWorkflow={onExecute}
          onEditWorkflow={onEdit}
          onDeleteWorkflow={onDelete}
          onDuplicateWorkflow={onDuplicate}
          executingWorkflowId={execution?.status === 'running' ? execution.commandSetId : undefined}
        />
      )}
    </div>
  )
}
