import { useState } from "react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { Button } from "@/shared/shadcn/button"
import { Input } from "@/shared/shadcn/input"
import {
  useStoreConfigs,
  useCreateStoreConfig,
  useActivateStoreConfig,
  useDeleteStoreConfig,
} from "@/shared/hooks/use-view-api"

export function SettingsPage() {
  const { data: storeConfigs = [], isLoading: configsLoading } = useStoreConfigs()
  const createConfig = useCreateStoreConfig()
  const activateConfig = useActivateStoreConfig()
  const deleteConfig = useDeleteStoreConfig()

  const [newName, setNewName] = useState("")
  const [newAddr, setNewAddr] = useState("")
  const [newDesc, setNewDesc] = useState("")

  const handleAddConfig = async () => {
    if (!newName.trim() || !newAddr.trim()) {
      toast.error("名称和地址为必填项")
      return
    }
    try {
      await createConfig.mutateAsync({
        name: newName.trim(),
        addr: newAddr.trim(),
        description: newDesc.trim(),
      })
      toast.success("数据源已添加")
      setNewName("")
      setNewAddr("")
      setNewDesc("")
    } catch (e) {
      toast.error("添加失败: " + String(e))
    }
  }

  const handleActivate = async (id: string) => {
    try {
      await activateConfig.mutateAsync(id)
      toast.success("已切换活跃数据源")
    } catch (e) {
      toast.error("切换失败: " + String(e))
    }
  }

  const handleDelete = async (id: string, isActive: boolean) => {
    if (isActive) {
      toast.error("无法删除活跃数据源，请先切换到其他数据源")
      return
    }
    try {
      await deleteConfig.mutateAsync(id)
      toast.success("数据源已删除")
    } catch (e) {
      toast.error("删除失败: " + String(e))
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:py-6 lg:px-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground">管理 sonar-store 数据源连接</p>
      </div>

      {/* Store configs list */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border bg-card p-6"
      >
        <h2 className="mb-1 font-semibold">数据源（sonar-store）</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          管理 sonar-store 连接配置，激活的数据源将用于指标查询
        </p>

        {configsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : storeConfigs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">暂无数据源，请在下方添加</p>
        ) : (
          <ul className="space-y-2">
            {storeConfigs.map((cfg) => (
              <li
                key={cfg.id}
                className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{cfg.name}</span>
                    {cfg.is_active && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        活跃
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground truncate block">
                    {cfg.addr}
                  </span>
                  {cfg.description && (
                    <span className="text-xs text-muted-foreground">{cfg.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {!cfg.is_active && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleActivate(cfg.id)}
                      disabled={activateConfig.isPending}
                    >
                      激活
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(cfg.id, cfg.is_active)}
                    disabled={deleteConfig.isPending || cfg.is_active}
                  >
                    删除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* Add store config form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border bg-card p-6"
      >
        <h2 className="mb-1 font-semibold">添加数据源</h2>
        <p className="mb-4 text-sm text-muted-foreground">新增一个 sonar-store 连接配置</p>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">名称 *</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="production"
                className="text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">地址 *</label>
              <Input
                value={newAddr}
                onChange={(e) => setNewAddr(e.target.value)}
                placeholder="localhost:8082"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">描述（可选）</label>
            <Input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="生产环境数据源"
              className="text-sm"
            />
          </div>
          <Button
            onClick={handleAddConfig}
            disabled={createConfig.isPending}
            className="self-start"
          >
            {createConfig.isPending ? "添加中…" : "添加数据源"}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
