import { SkeletonBlock, SkeletonStack } from "@/components/premium-feedback";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SkeletonBlock className="h-[220px]" />
        <SkeletonBlock className="h-[220px]" />
      </div>
      <SkeletonBlock className="h-[120px]" />
      <SkeletonStack
        count={4}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        itemClassName="h-[118px]"
      />
      <SkeletonBlock className="h-[320px]" />
      <SkeletonBlock className="h-[200px]" />
    </div>
  );
}
