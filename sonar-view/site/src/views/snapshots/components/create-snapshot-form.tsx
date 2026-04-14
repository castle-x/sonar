import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/shared/shadcn/button";
import { Input } from "@/shared/shadcn/input";
import { useCreateSnapshot } from "@/shared/hooks/use-view-api";
import type { TapInstance } from "@/shared/types";

interface FormValues {
  name: string;
  tapId: string;
  startTime: string;
  endTime: string;
}

interface CreateSnapshotFormProps {
  taps: TapInstance[];
  onClose: () => void;
}

export function CreateSnapshotForm({ taps, onClose }: CreateSnapshotFormProps) {
  const createSnapshot = useCreateSnapshot();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      tapId: taps[0]?.id ?? "",
    },
  });

  const onSubmit = (data: FormValues) => {
    const startTime = Math.floor(new Date(data.startTime).getTime() / 1000);
    const endTime = Math.floor(new Date(data.endTime).getTime() / 1000);

    createSnapshot.mutate(
      { name: data.name, tapId: data.tapId, startTime, endTime },
      {
        onSuccess: () => {
          toast.success("快照创建成功");
          onClose();
        },
        onError: (e) => toast.error(`创建失败: ${String(e)}`),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium">快照名称</label>
        <Input
          {...register("name", { required: "请输入名称" })}
          placeholder="如：压测-20260414"
        />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Tap 实例</label>
        <select
          {...register("tapId", { required: "请选择 Tap" })}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {taps.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id} ({t.appId})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">开始时间</label>
        <Input
          type="datetime-local"
          {...register("startTime", { required: "请选择开始时间" })}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">结束时间</label>
        <Input
          type="datetime-local"
          {...register("endTime", { required: "请选择结束时间" })}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" disabled={createSnapshot.isPending}>
          {createSnapshot.isPending ? "创建中..." : "创建"}
        </Button>
      </div>
    </form>
  );
}
