import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[96px]" />
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <SkeletonBlock className="h-[72px]" />
        <SkeletonBlock className="h-[72px]" />
        <SkeletonBlock className="h-[72px]" />
        <SkeletonBlock className="h-[72px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.08fr]">
        <SkeletonBlock className="h-[420px]" />
        <div className="space-y-4">
          <SkeletonBlock className="h-[160px]" />
          <SkeletonBlock className="h-[260px]" />
        </div>
      </div>
      <SkeletonStack
        count={3}
        className="grid gap-4 lg:grid-cols-3"
        itemClassName="h-[120px]"
      />
    </div>
  );
}
