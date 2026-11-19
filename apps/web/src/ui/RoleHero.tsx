import Image from "next/image";
import Link from "next/link";
import type { Persona } from "@madrasty/contracts";

export function RoleHero({ persona, title, detail, action }: {
  persona: Persona;
  title: string;
  detail: string;
  action: { href: string; label: string };
}) {
  return (
    <section className="role-hero" data-persona={persona} aria-label={title}>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
        <Link href={action.href} className="hero-action">{action.label}</Link>
      </div>
      <Image src={`/notebook-${persona}.svg`} width={120} height={140} unoptimized alt="" />
    </section>
  );
}
