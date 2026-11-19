import "server-only";

export function allowAuthMail(email: string) {
  const environment = process.env.SCHOOL_ENVIRONMENT;
  if (environment === "live") return true;
  if (environment !== "prelaunch") return false;
  const recipients = (process.env.PRELAUNCH_EMAIL_ALLOWLIST ?? "").split(",").map((address) => address.trim().toLowerCase());
  return recipients.includes(email.trim().toLowerCase());
}
