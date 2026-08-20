import type { Metadata } from "next";
import Link from "next/link";

import PublicLegalShell from "@/components/public-legal-shell";

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description: "Instrucciones públicas para solicitar la eliminación de datos relacionados con EntryFlow.",
};

export default function DataDeletionPage() {
  return (
    <PublicLegalShell
      currentPath="/data-deletion"
      title="Eliminación de datos"
      description="Si querés solicitar la eliminación de datos relacionados con EntryFlow, seguí estas instrucciones simples."
    >
      <section className="surface-elevated p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-8">
            <article className="space-y-3">
              <p className="text-sm text-slate-400">Última actualización: 20 de agosto de 2026</p>
              <p className="text-sm leading-7 text-slate-300">
                EntryFlow recibe solicitudes de eliminación de datos para los registros relacionados con el uso de la
                plataforma. Para ayudarnos a ubicar la información correcta, incluí la mayor cantidad de contexto útil
                posible sin enviar datos innecesarios.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Cómo solicitar la eliminación</h2>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-300">
                <li>Escribinos a <a href="mailto:leorodrigueztoro1@gmail.com" className="text-cyan-200 underline decoration-cyan-400/40 underline-offset-4 hover:text-cyan-100">leorodrigueztoro1@gmail.com</a>.</li>
                <li>Indicá que querés una solicitud de eliminación de datos para EntryFlow.</li>
                <li>Incluí la información mínima necesaria para identificar los datos correctos, por ejemplo nombre, evento, reserva o número de WhatsApp si corresponde.</li>
                <li>Si sos una organización, agregá el nombre del evento o referencia interna para acelerar la revisión.</li>
              </ol>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Qué podemos revisar</h2>
              <p className="text-sm leading-7 text-slate-300">
                Podemos revisar datos vinculados a invitados, reservas, accesos, invitaciones, registros operativos y
                estados de comunicación relacionados con el uso de EntryFlow. No hace falta enviar información
                sensible adicional si no es necesaria para ubicar tus datos.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Posibles retenciones</h2>
              <p className="text-sm leading-7 text-slate-300">
                En algunos casos, ciertos registros pueden conservarse si son necesarios por obligaciones legales,
                seguridad, prevención de fraude o resolución de disputas. Cuando esto ocurra, limitaremos el uso de esos
                registros a la finalidad correspondiente.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Plazos y respuesta</h2>
              <p className="text-sm leading-7 text-slate-300">
                Intentaremos responder en un plazo razonable y coordinar la eliminación o la derivación correspondiente
                con la organización que haya administrado el evento, cuando aplique.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Más información</h2>
              <p className="text-sm leading-7 text-slate-300">
                Si querés entender mejor qué datos procesamos y por qué, revisá nuestra{" "}
                <Link href="/privacy" className="text-cyan-200 underline decoration-cyan-400/40 underline-offset-4 hover:text-cyan-100">
                  Política de privacidad
                </Link>
                .
              </p>
            </article>
          </div>

          <aside className="space-y-4">
            <div className="surface-quiet p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Contacto</p>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Para solicitudes de eliminación, escribí a:
              </p>
              <a href="mailto:leorodrigueztoro1@gmail.com" className="mt-3 block text-sm font-medium text-cyan-200">
                leorodrigueztoro1@gmail.com
              </a>
            </div>

            <div className="surface-quiet p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Qué incluir</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <li>Nombre o referencia suficiente para ubicar el registro.</li>
                <li>Evento, reserva o invitación vinculada, si la conocés.</li>
                <li>Número de WhatsApp solo si fue usado en el evento.</li>
                <li>Sin adjuntar datos innecesarios.</li>
              </ul>
            </div>

            <div className="surface-quiet p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Navegación</p>
              <div className="mt-4 flex flex-col gap-3 text-sm">
                <Link href="/privacy" className="text-slate-300 hover:text-white">
                  Política de privacidad
                </Link>
                <Link href="/data-deletion" className="text-cyan-200">
                  Eliminación de datos
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </PublicLegalShell>
  );
}
