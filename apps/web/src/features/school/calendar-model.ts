import type { SchoolYear } from "@madrasty/contracts";

export type CalendarException = {
  id: string; yearId: string; classId?: string | null;
  schoolDate: string; teaching: boolean; reason: string; revision: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const schoolDateUTC = (date: string) => new Date(date + "T12:00:00Z");
export const dateISO = (date: Date) => date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate());
export function shiftDate(date: string, difference: number) {
  const result = schoolDateUTC(date);
  result.setUTCDate(result.getUTCDate() + difference);
  return dateISO(result);
}
export const asInclusiveEnd = (exclusive: string) => shiftDate(exclusive, -1);
export const asExclusiveEnd = (inclusive: string) => shiftDate(inclusive, 1);

export function chooseCalendarYear(years: SchoolYear[], today: string): SchoolYear | undefined {
  return years.find(y => y.state === "active" && y.startsOn <= today && today < y.endsExclusive)
    ?? years.find(y => y.state === "active")
    ?? years.find(y => y.startsOn <= today && today < y.endsExclusive)
    ?? years[0];
}
export function withinCalendarYear(date: string, year: SchoolYear): boolean {
  return year.startsOn <= date && date < year.endsExclusive;
}
export function calendarMonthCells(year: number, month: number): (string | null)[] {
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, i) => year + "-" + pad(month) + "-" + pad(i + 1))];
}
export function directCalendarException(date: string, exceptions: CalendarException[], classId: string): CalendarException | undefined {
  return exceptions.find(x => x.schoolDate === date && (x.classId ?? "") === classId);
}
export function calendarDayState(
  date: string, year: SchoolYear, exceptions: CalendarException[], classId: string,
): { valid: boolean; teaching: boolean; exception?: CalendarException; direct?: CalendarException; school?: CalendarException } {
  const valid = withinCalendarYear(date, year);
  const weekday = ((schoolDateUTC(date).getUTCDay() + 6) % 7) + 1;
  const school = directCalendarException(date, exceptions, "");
  const direct = classId ? directCalendarException(date, exceptions, classId) : school;
  const exception = direct ?? school;
  return { valid, teaching: valid && (exception?.teaching ?? year.teachingWeekdays.includes(weekday)), exception, direct, school };
}
export function monthTeachingCount(
  year: number, month: number, selectedYear: SchoolYear,
  exceptions: CalendarException[], classId: string,
) {
  return calendarMonthCells(year, month).filter((date) =>
    date !== null && calendarDayState(date, selectedYear, exceptions, classId).teaching).length;
}
export function yearTitle(y: SchoolYear): string {
  const end = asInclusiveEnd(y.endsExclusive);
  const first = y.startsOn.slice(0, 4), last = end.slice(0, 4);
  return first === last ? first : first + "/" + last.slice(-2);
}
