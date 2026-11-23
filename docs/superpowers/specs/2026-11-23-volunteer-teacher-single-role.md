# One Volunteer Teacher Role — Small-School UX

**Intent:** Madrasty El Arabia is a small university-supported school run by administrators and volunteer teachers. Teacher accounts have one role: **مدرس / Lehrkraft**. No German school-system distinction between `Klassenlehrkraft` and `Fachlehrkraft` is exposed to staff or admins.

**Chosen approach:** Reuse the existing secure `primary` class assignment underneath the UI because it already grants attendance, teaching, grades and class communication across all subjects. Collapse the two visible options into one simple optional class assignment. Keep existing legacy subject assignments and audit history intact; do not redesign database authorization or introduce production SQL.

**Required behavior:** The account form asks for name, email, permanent password, optional phone/language, and optional school year + class; it never asks for type or subject. Selecting a class provisions a teacher with a complete class assignment automatically. The class workspace shows `Lehrkraft` and a simple teacher selector, not two roles or a subject selector. Only one responsible teacher is assigned per class at a time; replacement/attendance history remains in the advanced admin workflow. Admin remains read-only regarding teaching content and cannot receive a teacher assignment.

**Out of scope:** Rewriting archived assignments, changing database role enums, removing individual subject catalog/course functionality, redesigning the student/guardian apps, altering color/layout tokens.

**Alternatives rejected:** Keep two roles but use friendlier names (still a choice user rejected); migrate SQL to a new assignment type (unnecessary and riskier for existing records).

**Verification:** Chromium E2E tests cover absence of `Klassenlehrkraft`/`Fachlehrkraft` and `Fach` selection in common forms, successful direct class assignment, and permission boundaries. Full CI domain, build, UI and Android must pass before merge.
