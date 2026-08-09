import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[150px]" />
      <SkeletonStack
        count={4}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        itemClassName="h-[118px]"
      />
      <div className="space-y-3">
        <SkeletonBlock className="h-[120px]" />
        <SkeletonBlock className="h-[120px]" />
        <SkeletonBlock className="h-[120px]" />
        <SkeletonBlock className="h-[120px]" />
      </div>
    </div>
  );
}
