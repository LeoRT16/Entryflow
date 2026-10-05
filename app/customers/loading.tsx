import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="surface-panel space-y-4 p-4 xl:p-5">
        <SkeletonBlock className="h-14" />
        <SkeletonBlock className="h-12" />
        <SkeletonStack count={5} className="flex gap-2" itemClassName="h-8 w-20" />
      </div>
      <div className="surface-panel space-y-3 p-4 xl:p-5">
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonStack count={3} itemClassName="h-20" />
      </div>
    </div>
  );
}
