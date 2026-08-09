import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-[140px]" />
      <div className="grid gap-4 xl:grid-cols-5">
        <SkeletonStack count={5} itemClassName="h-[118px]" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <SkeletonBlock className="h-[620px]" />
        <div className="space-y-5">
          <SkeletonBlock className="h-[220px]" />
          <SkeletonBlock className="h-[220px]" />
          <SkeletonBlock className="h-[220px]" />
          <SkeletonBlock className="h-[220px]" />
        </div>
      </div>
    </div>
  );
}
