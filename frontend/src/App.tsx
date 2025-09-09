import './App.css'
import { useCommands } from './hooks/useCommands'
import { useLogger } from './hooks/useLogger'
import { CommandList } from './components/CommandList'
import { LogDisplay } from './components/LogDisplay'

export default function App() {
    const { commands, loading, storeCommand, getAllCommands, executeCommand } = useCommands()
    const { log, logInfo, logError, logSuccess, clearLog } = useLogger()

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