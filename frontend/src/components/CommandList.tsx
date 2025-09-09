import { type CommandSet } from '../types'

interface CommandListProps {
  commands: CommandSet[]
  loading: boolean
  onExecuteCommand: (commandId: string) => void
}

export function CommandList({ commands, loading, onExecuteCommand }: CommandListProps) {
  if (commands.length === 0) {
    return <p>No command sets available</p>
  }

  return (
    <ul>
      {commands.map((commandSet, index) => (
        <li key={index} style={{ marginBottom: 8 }}>
          <div>
            <code>
              id={commandSet.commandId} name={commandSet.commandName} scripts={commandSet.commandScripts.length}
            </code>
          </div>
          <div>
            <button 
              disabled={loading} 
              onClick={() => onExecuteCommand(commandSet.commandId)}
            >
              Run
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}