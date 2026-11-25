const paths = {
  chevron: "m9 5 7 7-7 7",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M18 6 6 18",
  sendUp: "M12 19V5m-6 6 6-6 6 6",
  retry: "M3 11a9 9 0 1 1 2.7 7M3 4v7h7",
  photo: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9h.01",
  camera: "M3 7h4l2-3h6l2 3h4v13H3zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-3 0h6",
  school: "M3 21h18M5 21V9l7-6 7 6v12M9 21v-6h6v6M9 10h6",
  teacher: "M3 4h18v12h-7M7 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2 21v-3q0-5 5-5t5 5v3",
  receipt: "M5 3l3 2 4-2 4 2 3-2v18l-3-2-4 2-4-2-3 2zM8 9h8m-8 4h8",
  home: "M2 11 12 3l10 8M5 10v10h5v-6h4v6h5V10",
  students: "M3 21v-2q0-5 6-5t6 5v2M11 4q5 0 5 4 0 3-3 4M16 15q5 0 5 5M9 5a3 3 0 1 0 .1 0",
  children: "M3 21v-2q0-5 6-5t6 5v2M11 4q5 0 5 4 0 3-3 4M16 15q5 0 5 5M9 5a3 3 0 1 0 .1 0",
  attendance: "M4 6h16v15H4zM7 3v5m10-5v5M4 10h16m-11 5 2 2 4-4",
  messages: "M3 4h18v13h-9l-5 4v-4H3z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21a2 2 0 0 0 4 0",
  more: "M4 12h1m6.5 0h1m6.5 0h1",
  back: "m14 5-7 7 7 7",
  warning: "M12 8v5m0 3v.5M12 2l10 18H2z",
  check: "m4 12 5 5L20 6",
  clock: "M12 5v7l4 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  lock: "M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4z",
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className={name === "back" || name === "chevron" ? "mirrored" : undefined} aria-hidden="true" viewBox="0 0 24 24" width="24" height="24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
