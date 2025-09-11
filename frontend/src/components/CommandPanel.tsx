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
    <div className="control-panel">
      <div className="panel-header">
        <h2>命令集</h2>
        <div className="header-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>模式</label>
            <select
              value={mode}
              onChange={e => onModeChange?.(e.target.value as 'local' | 'cloud')}
              className="btn btn-secondary"
            >
              <option value="local">本地</option>
              <option value="cloud">云端</option>
            </select>
            {mode === 'cloud' && (
              <>
                <label style={{ fontSize: 12, opacity: 0.8 }}>设备</label>
                <select
                  value={selectedDeviceId ?? ''}
                  onChange={e => onSelectDevice?.(e.target.value)}
                  className="btn btn-secondary"
                >
                  <option value="" disabled>选择设备</option>
                  {cloudDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.name || d.deviceId}{d.status ? ` (${d.status})` : ''}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary" disabled={cloudLoading} onClick={onRefresh} title="刷新设备/命令">
                  🔄 刷新
                </button>
              </>
            )}
          </div>
          <button
            className="btn btn-secondary"
            disabled={loading || isRunning}
            onClick={onRefresh}
            title="刷新命令集列表"
          >
            🔄 刷新
          </button>
          <button
            className="btn btn-primary"
            onClick={onCreate}
            disabled={isRunning}
          >
            ➕ 新建命令集
          </button>
        </div>
      </div>

      {commandSets.length === 0 && !loading ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <h3>还没有命令集</h3>
          <p>创建第一个命令集来开始远程控制</p>
          <button 
            className="btn btn-primary" 
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
