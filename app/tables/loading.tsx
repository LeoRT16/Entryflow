import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[112px]" />
      <SkeletonBlock className="h-[72px]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SkeletonStack count={6} itemClassName="h-[170px]" />
      </div>
    </div>
  );
}
