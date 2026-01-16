import type { DeviceModel } from '../proto/home/service'

interface ModelsPageProps {
  models: DeviceModel[]
  modelLoading: boolean
  onEdit: (model: DeviceModel) => void
  onDelete: (model: DeviceModel) => void
}

export function ModelsPage({ models, modelLoading, onEdit, onDelete }: ModelsPageProps) {
  return (
    <div className="space-y-3">
      {models.length === 0 && !modelLoading ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">暂无设备模型</div>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(320px,420px))]">
          {models.map(m => (
            <div key={`${m.id}@${m.version}`} className="rounded-2xl border border-black/10 bg-white/70 p-3 shadow-[0_8px_24px_rgba(15,21,32,0.12)] dark:border-white/10 dark:bg-white/[0.06]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate">{m.name || m.id}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {m.id}@{m.version}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs px-2 py-1 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
                    onClick={() => onEdit(m)}
                  >
                    编辑
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/10"
                    onClick={() => onDelete(m)}
                  >
                    删除
                  </button>
                </div>
              </div>
              {m.description && (
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{m.description}</div>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>动作 {m.actions?.length || 0}</span>
                <span>字段 {Object.keys(m.stateSchema || {}).length}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
