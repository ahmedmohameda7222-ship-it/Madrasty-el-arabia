"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

export function SchoolLink({ children, className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={className ? `school-link ${className}` : "school-link"}>
      {children}
      <PendingIndicator />
    </Link>
  );
}

function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span className="school-link-pending" aria-hidden="true" /> : null;
}
