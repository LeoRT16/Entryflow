import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[150px]" />
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <SkeletonBlock className="h-[360px]" />
        <SkeletonStack count={3} className="grid gap-4" itemClassName="h-[128px]" />
      </div>
    </div>
  );
}
