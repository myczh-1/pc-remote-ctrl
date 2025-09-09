import { WorkflowEditor } from './WorkflowEditor'
import type { CommandSet } from '../types'

interface EditorModalProps {
  isVisible: boolean
  editingCommandSet?: CommandSet
  availableCommands: CommandSet[]
  onSave: (commandSetData: Omit<CommandSet, 'commandId' | 'created'>) => Promise<void>
  onCancel: () => void
}

export function EditorModal({
  isVisible,
  editingCommandSet,
  availableCommands,
  onSave,
  onCancel
}: EditorModalProps) {
  if (!isVisible) {
    return null
  }

  return (
    <WorkflowEditor 
      workflow={editingCommandSet}
      availableCommands={availableCommands}
      onSave={onSave}
      onCancel={onCancel}
    />
  )
}