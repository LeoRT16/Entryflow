import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[148px]" />
      <SkeletonBlock className="h-[96px]" />
      <SkeletonStack
        count={3}
        className="grid gap-4 lg:grid-cols-3"
        itemClassName="h-[260px]"
      />
    </div>
  );
}
