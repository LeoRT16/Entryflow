import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[150px]" />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SkeletonBlock className="h-[640px]" />
        <div className="space-y-4">
          <SkeletonBlock className="h-[220px]" />
          <SkeletonStack count={2} className="grid gap-4" itemClassName="h-[160px]" />
          <SkeletonBlock className="h-[220px]" />
        </div>
      </div>
    </div>
  );
}
