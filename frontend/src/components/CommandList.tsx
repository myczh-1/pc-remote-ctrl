import { type Command } from '../types'

interface CommandListProps {
  commands: Command[]
  loading: boolean
  onExecuteCommand: (commandId: string) => void
}

export function CommandList({ commands, loading, onExecuteCommand }: CommandListProps) {
  if (commands.length === 0) {
    return <p>No commands available</p>
  }

  return (
    <ul>
      {commands.map((command, index) => (
        <li key={index} style={{ marginBottom: 8 }}>
          <div>
            <code>
              id={command.commandId} name={command.commandName} script={command.commandScript}
            </code>
          </div>
          <div>
            <button 
              disabled={loading} 
              onClick={() => onExecuteCommand(command.commandId)}
            >
              Run
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}