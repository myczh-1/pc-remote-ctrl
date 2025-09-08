// src/App.tsx
import './App.css'
import { useCommands } from './hooks/useCommands'
import { useLogger } from './hooks/useLogger'
import { CommandList } from './components/CommandList'
import { LogDisplay } from './components/LogDisplay'
import { useCommandStream } from './hooks/useCommandStream'

export default function App() {
  const { commands, loading, storeCommand, getAllCommands, executeCommand } = useCommands()
  const { log, logInfo, logError, logSuccess, clearLog, append } = useLogger() as any
  // ↑ 如果 useLogger 没有 append，可以改成用 logInfo/Success 逐行追加

  const { running, start, stop } = useCommandStream()

  const handleStoreSample = async () => {
    const result = await storeCommand({
      commandId: 'demo',
      commandName: 'echo-demo',
      commandScript: 'echo hello-from-protobuf-ts',
      description: 'stored from web',
    })

    if (result.success) {
      logSuccess(`StoreCommand: ${result.message}`)
    } else {
      logError(`StoreCommand ERROR: ${result.message}`)
    }
  }

  const handleListAllCommands = async () => {
    const result = await getAllCommands()

    if (result.success) {
      logInfo(`GetAllCommands: ${result.commands.length} items`)
    } else {
      logError('GetAllCommands ERROR: Failed to fetch commands')
    }
  }

  const handleExecuteCommand = async (commandId: string) => {
    const result = await executeCommand(commandId)
    const logMessage = `ExecuteCommand(${commandId}): code=${result.exitCode} output="${result.output.trim()}" error="${result.error}"`
    if (result.success) {
      logSuccess(logMessage)
    } else {
      logError(logMessage)
    }
  }

  // 新增：开始/停止日志流（示例对 demo；你也可以在 CommandList 里加“Stream”按钮传入具体 id）
  const handleStartStream = async () => {
    clearLog()
    // 默认用 demo；实际可改成你点击的命令 ID
    const commandId = 'demo'
    await start(
      commandId,
      (line) => {
        // 每一行日志：格式化并追加到 LogDisplay
        const s = `[${String(line.index).padStart(4, ' ')}][${line.stream}] ${line.line}\n`
        append ? append(s) : logInfo(s) // 如果 useLogger 没有 append，就用 logInfo 代替
      },
      () => logSuccess(`ExecuteCommandStream(${commandId}) finished.`),
      (err) => logError(`ExecuteCommandStream ERROR: ${String(err)}`),
    )
  }

  const handleStopStream = () => {
    stop()
    logInfo('stream stopped by user')
  }

  return (
    <>
      <h1>gRPC-Web Controller</h1>

      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <button disabled={loading} onClick={handleStoreSample}>
          ① Store sample "echo"
        </button>
        <button disabled={loading} onClick={handleListAllCommands}>
          ② List all commands
        </button>
        <div style={{ marginTop: 8 }}>
          <button disabled={running} onClick={handleStartStream}>
            ▶ Start stream (demo)
          </button>
          <button disabled={!running} onClick={handleStopStream} style={{ marginLeft: 8 }}>
            ■ Stop
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Commands</h3>
        <CommandList
          commands={commands}
          loading={loading}
          onExecuteCommand={handleExecuteCommand}
        />
      </div>

      <LogDisplay log={log} onClear={clearLog} />
    </>
  )
}
