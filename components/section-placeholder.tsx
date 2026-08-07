import Topbar from "@/components/topbar";
import { EmptyState } from "@/components/premium-feedback";

export default function SectionPlaceholder({
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
}) {
  return (
    <>
      <Topbar eyebrow="Operación" title={title} description={description} />

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <EmptyState
          icon="spark"
          title={`No hay contenido operativo en ${title.toLowerCase()}.`}
          description={description}
          primaryAction={primaryAction ?? { label: "Volver al centro", href: "/" }}
          secondaryAction={secondaryAction}
        />
      </section>
    </>
  );
}
