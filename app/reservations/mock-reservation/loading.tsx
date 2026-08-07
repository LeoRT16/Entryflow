import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[150px]" />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SkeletonBlock className="h-[360px]" />
        <SkeletonBlock className="h-[360px]" />
      </div>
      <SkeletonBlock className="h-10" />
      <SkeletonStack count={3} className="grid gap-4" itemClassName="h-[280px]" />
      <SkeletonBlock className="h-[160px]" />
    </div>
  );
}
