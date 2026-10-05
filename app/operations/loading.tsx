import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <SkeletonBlock className="h-[82px]" />
      <SkeletonBlock className="h-8 w-32" />
      <SkeletonStack count={4} className="space-y-2" itemClassName="h-[92px]" />
      <SkeletonBlock className="h-8 w-32" />
      <SkeletonStack count={3} className="space-y-2" itemClassName="h-[92px]" />
    </div>
  );
}
