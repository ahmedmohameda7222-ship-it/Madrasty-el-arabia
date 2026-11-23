# Madrasty El Arabia — Admin Class Monitoring (Class-First) — Design Specification

**Status:** DRAFT FOR PRODUCT REVIEW — NOT APPROVED FOR IMPLEMENTATION  
**Date:** 2026-11-23  
**Repository baseline:** main after PR #11 (single volunteer Lehrkraft).  
**Owner-approved product decisions:** Class list first; class dashboard second; simple Arabic and German; school is small and university-supported with volunteer teachers; Admin observes teaching but does not teach; Admin must not see drafts, pending grades, or unpublished evaluations.

## 1. Purpose and scope

Build a calm, mobile-first **administrative monitoring experience**. An Admin first sees a list of school classes. Selecting a class opens one **Class Overview / متابعة الفصل / Klassenübersicht** dashboard; from there the Admin can inspect any student's official academic and attendance record. The Admin can move among class, section and student details without repeatedly selecting class/year. Do not turn Admin into a teacher or duplicate the complex teacher editor.

Success: An Admin can answer, quickly and without write actions: Which students belong to this class? Who was absent or late on a formally approved day? Which exams were announced, which results were published, which homework/activities have visible results, and what officially published evaluations/teacher records exist? What changed since their last visit?

### Out of scope
- Any teacher-grade, attendance, exam, evaluation, homework or lesson authoring/editing/publishing by Admin.
- Draft inspection, unpublished marks, unapproved individual attendance rows, or hidden private teacher working notes.
- School-wide analytics dashboard ahead of the class list.
- German school-system teacher subroles (Klassenlehrkraft, Fachlehrkraft); one role only: Lehrkraft / مدرس.
- Parent app redesign, unrelated administrative finance/HR features, predictive student ratings, arbitrary low-score alerts, automatic parent messaging, data export in V1.

### Existing administrative work must remain
Admin retains previously authorized school administration tasks (class setup, enrollment, staff accounts and assignments). Monitoring read-only applies to **teaching and assessment records**, not to legitimate administrative configuration. Expose these in a visually separate **إدارة / Verwaltung** area rather than teacher-style edit controls on monitoring pages.

## 2. Approaches

**A. Copy teacher pages, disable forms.** Quick initially but teacher concepts, editing affordances and draft queries can leak into Admin view. Rejected.

**B. Rebuild all school data as a parallel Admin system.** Flexible but costly, creates inconsistent duplicated academic logic. Rejected.

**C. Recommended: dedicated Admin monitoring screens backed by official read-only projections and shared authorized read services.** Keep enrollment/class management unchanged, reuse existing class/academic domain models, introduce safe role-filtered endpoints where required. Preserve one teacher role and all historical records. *Technical approach is a proposed decision; product owner approval pending.*

**Information architecture decision ALREADY CHOSEN by owner:** Classes list first; Class Dashboard after selecting one class.

## 3. Navigation and screen hierarchy

Admin sidebar/home -> **الفصول / Klassen** (list) -> **متابعة الفصل / Klassenübersicht** (dashboard) -> section -> **ملف الطالب / Schülerprofil** (optional) -> back to the same class and date filters.

- Do not make a school-wide Dashboard the landing page for this workflow.
- Make the existing class management area and monitoring view coherent; do not create two competing 'classes' menus. Admin entry point is a clear class list; details have a dedicated monitoring view, while class configuration stays in separate administrative controls.
- Preserve yearId and classId (and studentId, time range when relevant) through navigation/URLs; back must restore list position and filters where feasible.
- Show a breadcrumb or simple back text: الفصول ← الفصل ← الطالب / Klassen → Klasse → Schüler.
- On mobile: vertically stacked content, no tables requiring horizontal scrolling for the primary tasks. Large screens can use a two-column detail view.
- If a class has no assigned teacher, display 'لم يُعين مدرس' / 'Keine Lehrkraft zugewiesen', not a blocking error.

## 4. Screen A — Class list (initial)

### Layout
Header 'الفصول' / 'Klassen', one school-year selector, one class search, then clean class rows/cards. One class per tappable row. No pre-selection, no school-wide metrics gallery.

### Each class row shows
- Class code + localized name; teacher name (Lehrkraft / المدرس) or unassigned.
- Current enrolled student count (as of the chosen year/date; do not confuse capacity with count).
- Last **approved** attendance date, if available.
- A compact indication of newly published/announced information, only if grounded (e.g., 'نتائج جديدة' / 'Neue Ergebnisse'); no invented unread state.
- Single clear action 'عرض الفصل' / 'Klasse ansehen' or tap the entire row.

### States
Empty year -> 'لا توجد فصول' / 'Keine Klassen'; search no-match distinct from empty year; loading skeleton; recoverable error with Retry; archived/closed classes remain inspectable for historical reports. No false zero where data could not be loaded.

## 5. Screen B — Class Dashboard (after class selection)

### Header
'متابعة الفصل / Klassenübersicht', class name/code, school year, teacher, back to list, quiet 'عرض فقط / Nur ansehen' descriptor. This descriptor refers to academic monitoring; admin class-settings links may exist separately.

### Top summary area, strictly from reliable data
1. Total enrolled students (as-of selected school date).
2. Last approved attendance record, date + present/absent/late counts. If none, say 'لا يوجد كشف معتمد' / 'Noch keine bestätigte Anwesenheit', NOT zero absences.
3. Announced exams and newest officially published exam results, with dates.
4. Latest published evaluation or available recorded class activity; show a clear empty state instead of fabricated progress.

Metrics are summaries, not a score for the class. Do not mix counts for different time windows without labeling periods.

### Primary sections (short, easy-to-scan)
- **الطلبة / Schüler**: enrolled students and open Student Profile.
- **الحضور / Anwesenheit**: approved attendance by day, student statuses: حاضر/Anwesend, متأخر/Verspätet, غائب/Fehlt, غائب بعذر/Entschuldigt (align exact labels with underlying status enum).
- **الامتحانات والدرجات / Prüfungen und Noten**: announced exam schedule; published results by exam and student; no unannounced exam or pending marks.
- **الواجبات والأنشطة / Hausaufgaben und Aktivitäten**: official assigned/saved work with visible/published marks and published feedback only. Confirm lifecycle semantics before implementation for data sources lacking a separate publication state.
- **التقييمات / Beurteilungen**: published periodic student evaluations, with participation, understanding, preparation, strengths and improvements.
- **سجل الحصص / Unterrichtsverlauf**: recorded/completed teaching logs, not a teacher draft editor. If a source lacks a definitive state, resolve its visibility policy before exposing it.

A 'Recent official updates' section can show latest published exam/evaluation/homework updates, with who/what/date if available. Do **not** claim to know 'new since last visit' without tracking user-specific read state.

### Drill-down
All sections are scoped to the selected class and year; no need to choose another subject or class merely to view official results. Optional subject/time filters appear inside sections, with defaults of 'الكل / Alle'. The class identifier is enforced by server authorization, not trusted from the browser alone.

## 6. Screen C — Student Profile within class

### Header
Student name, student number, selected class/year, back to class dashboard. Read-only.

### Sections
- Attendance summary + dated approved records; present, excused/unexcused absence, late.
- All **published** exam scores: subject, title, date, score / maximum; no scores that are merely saved as drafts.
- Official visible homework and activity scores and feedback.
- All **published** periodic evaluations: dimensions (1–5 where applicable), written strengths and areas to improve, period and published date.
- Simple timeline or history of formally published records; optional trend only when at least two comparable results exist. Different max-score scales must be normalized and labeled before aggregation; otherwise display individual records, not invented averages.

No 'at-risk', 'weak student', ranking, or performance classification without a separately approved method. Missing result != zero; 'لم تُنشر النتيجة' / 'Noch kein veröffentlichtes Ergebnis' is the default missing state.

## 7. Publication and attendance visibility policy (non-negotiable)

| Domain | Admin CAN view | Admin MUST NOT view |
|---|---|---|
| Student enrollment | Authorized class roster and enrollment history | Data outside authorized school scope |
| Attendance | **Approved/confirmed** sheets and per-student approved statuses | Open sheet row values and unsent/unapproved draft statuses |
| Exams | **Announced** exams and dates; **published** grades, max score and published feedback | Unannounced exams, unpublished marks, private grading notes |
| Evaluations | Published version only, including published comments and dimension scores | Draft evaluation version or unpublished correction |
| Homework | Officially assigned/visible homework; published/visible scores and feedback | In-progress grade revisions or private teacher drafts |
| Activities | Final saved activity metadata where it has official visibility; visible scores | Hidden/unpublished scores and working drafts |
| Teaching logs | Completed/recorded class entries that are official under the agreed lifecycle | Unsubmitted/working notes or private draft changes |
| Corrections | Latest officially published correction | Unpublished corrections and internal draft revision values |

If source systems do not encode 'published' or 'approved' explicitly, implementation must **not guess**. Establish an explicit server-side visibility rule and demonstrate it in tests before showing it in Admin.

Current technical audit notes, **not promises of already-safe access**:
- Existing apps/web/src/features/school/Enrollments.tsx handles class/enrollment details and currently lacks an academic student-monitoring dashboard.
- AdminTeachingOverview.tsx + schoolOversight() provide aggregate oversight, not complete per-student academic drilldown.
- Some existing academic projections include draft and published fields together (e.g. evaluationEntry.publishedId, examEntry.announcementId/resultPublishedAt, homeworkGradeRow.visible). Do NOT pass these full teacher-oriented rows verbatim to Admin; return a dedicated restricted shape or server-filtered projection.
- Attendance history reads approved_attendance_rows; daily sheets can be open. Prefer approved-only read models for Admin details.
- The current school roster API may require students.manage; the new monitor-read capability must be authorized separately without giving Admin additional administrative mutation rights.

## 8. Role and API boundary

- Only authorized Admin school-monitoring capability can read cross-class official views.
- Teacher retains existing classroom editing/marking scope; no teacher workflow regression.
- Guardian retains own-linked-child access only.
- Academic monitoring API has GET-only interfaces. **Existing write endpoints remain forbidden** to Admin (including direct API calls).
- Server filters by persona + school/class scope and publication status **before response serialization**, not with client-side hiding.
- Responses must not contain draft text, unpublished scores, unpublished feedback or edit permission flags that could reveal private content. Review database projection functions and SQL/RLS before implementing.
- Use authentication, per-class authorization, rate limits, safe caching/private no-store as needed. Keep audit requirements for sensitive read access under review.
- No school-record mutation, schema migration, deployment, or merge is authorized by this design document.

## 9. Visual system and usability

**Intent:** Professional, restrained administrative dashboard, calm dark theme already used by Madrasty El Arabia, not neon or gambling-like iconography.

- Mobile-first; 44px or larger interactive targets; no dense desktop table on small screens.
- One clearly emphasized section/action at a time; limited icons; primary data in plain text.
- Arabic RTL and German LTR, same information architecture.
- Straightforward labels, not bureaucratic compounds: الفصول/Klassen, متابعة الفصل/Klassenübersicht, الطلبة/Schüler, الحضور/Anwesenheit, درجات/Noten, التقييمات/Beurteilungen, عرض/Ansehen, رجوع/Zurück.
- Status is text + optional icon; never color-only. Ensure contrast, keyboard navigation, visible focus, meaningful headings and accessible labels.
- Compact top summary with official dates, then sections; no charts unless enough actual comparable published data.
- Empty/loading/error/forbidden/partial-unavailable states are distinct. Non-loaded is not zero. Date timezone from school configuration; user-selected day ranges must be visible.
- Avoid redundant selection of year/class within a section.

## 10. Acceptance scenarios (for later Implementation Plan; no tests written yet)

1. Admin selects class in list, lands on dashboard with correct class and year, sees roster and latest approved attendance.
2. Admin opens each section, can drill down to one student's official results and back without losing class/year/filters.
3. Teacher-created draft exam/evaluation/score/correction is absent even from raw Admin network responses; after announcement/publication only approved fields appear.
4. Open attendance sheet individual statuses are not readable by Admin; after teacher approval they become visible and dated.
5. Admin cannot create/edit/publish grades, homework, activities, exams, teaching logs or attendance even via direct API calls.
6. Different classroom and different student's data never leak into selected class detail.
7. School admin's existing legitimate enrollment/class/staff-management capabilities remain available in their separate administrative area.
8. Arabic and German provide equivalent meaning; mobile 320px–tablet–desktop layouts, keyboard/touch, accessible states.
9. Empty school, class without teacher, class with no exam/approved attendance, unavailable API and archived class have correct no-data states.
10. Historical published correction replaces old official value; unpublished correction remains unseen, and timestamps/status labels are accurate.

## 11. Decisions and remaining approval gate

**Owner-decided:** classes list -> class dashboard -> student profile; no school-wide dashboard first; only official teacher-submitted/published/approved data; no drafts; one volunteer teacher type; simple bilingual design; Admin teaching read-only.

**Proposed defaults to approve:**
- Use approach C: dedicated Admin monitoring interface plus safe server-side read models.
- Attendance is **approved-only for individual status details**, matching the existing owner's selected published/approved-only rule.
- Saved teaching logs count as visible only if finalized/recorded; when finalization cannot be distinguished, do not reveal private note content until a rule is defined.
- No predictive scores, arbitrary thresholds, or rankings in V1.
- Class roster list is the first Admin monitoring screen; class configuration remains reachable as a separate administrative function.

**Before implementing:** get explicit owner sign-off on this design document, then author a separate bite-sized TDD Implementation Plan. This spec is not an implementation authorization.
