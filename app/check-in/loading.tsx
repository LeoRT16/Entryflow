import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return <div className="space-y-5">
    <SkeletonBlock className="h-[112px]" />
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-5">
        <SkeletonBlock className="h-[470px]" />
        <SkeletonBlock className="h-[220px]" />
      </div>
      <SkeletonStack count={1} className="grid gap-4" itemClassName="h-[560px]" />
    </div>
  </div>;
}
