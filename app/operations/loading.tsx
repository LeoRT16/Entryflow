import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[150px]" />
      <SkeletonStack
        count={6}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        itemClassName="h-[116px]"
      />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SkeletonBlock className="h-[460px]" />
        <div className="space-y-4">
          <SkeletonBlock className="h-[220px]" />
          <SkeletonBlock className="h-[220px]" />
          <SkeletonBlock className="h-[220px]" />
        </div>
      </div>
    </div>
  );
}
