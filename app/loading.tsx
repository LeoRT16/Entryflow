import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[160px]" />
      <SkeletonStack
        count={4}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        itemClassName="h-[118px]"
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.74fr]">
        <SkeletonBlock className="h-[360px]" />
        <div className="space-y-4">
          <SkeletonBlock className="h-[220px]" />
          <SkeletonBlock className="h-[200px]" />
        </div>
      </div>
    </div>
  );
}
