const paths = {
  home: "M2 11 12 3l10 8M5 10v10h5v-6h4v6h5V10",
  students: "M3 21v-2q0-5 6-5t6 5v2M11 4q5 0 5 4 0 3-3 4M16 15q5 0 5 5M9 5a3 3 0 1 0 .1 0",
  children: "M3 21v-2q0-5 6-5t6 5v2M11 4q5 0 5 4 0 3-3 4M16 15q5 0 5 5M9 5a3 3 0 1 0 .1 0",
  attendance: "M4 6h16v15H4zM7 3v5m10-5v5M4 10h16m-11 5 2 2 4-4",
  messages: "M3 4h18v13h-9l-5 4v-4H3z",
  more: "M4 12h1m6.5 0h1m6.5 0h1",
  back: "m14 5-7 7 7 7",
  warning: "M12 8v5m0 3v.5M12 2l10 18H2z",
  check: "m4 12 5 5L20 6",
  clock: "M12 5v7l4 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  lock: "M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4z",
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className={name === "back" ? "mirrored" : undefined} aria-hidden="true" viewBox="0 0 24 24" width="24" height="24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
