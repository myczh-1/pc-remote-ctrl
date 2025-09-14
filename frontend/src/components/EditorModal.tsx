import { CommandSetEditor } from './CommandSetEditor'
import type { CommandSet } from '../types'

interface EditorModalProps {
  isVisible: boolean
  editingCommandSet?: CommandSet
  availableCommands: CommandSet[]
  onSave: (commandSetData: Omit<CommandSet, 'commandId' | 'created'>) => Promise<void>
  onCancel: () => void
  isDarkMode?: boolean
}

export function EditorModal({
  isVisible,
  editingCommandSet,
  availableCommands,
  onSave,
  onCancel,
  isDarkMode = false
}: EditorModalProps) {
  if (!isVisible) {
    return null
  }

  return (
    <CommandSetEditor
      commandSet={editingCommandSet}
      availableCommands={availableCommands}
      onSave={onSave}
      onCancel={onCancel}
      isDarkMode={isDarkMode}
    />
  )
}