import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[170px]" />
      <SkeletonBlock className="h-[260px]" />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.74fr]">
        <SkeletonBlock className="h-[320px]" />
        <div className="space-y-4">
          <SkeletonBlock className="h-[220px]" />
          <SkeletonBlock className="h-[220px]" />
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
