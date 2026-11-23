import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("a school administrator sets up classes, staffing, enrollment and a clash-safe timetable", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    const { year, apple, offering, room, ids, command } = await setUpCalendar(school, admin);
    const collisionKey = `${school.run}.calendar-replay`;
    const draft = {
      yearId: year.id, code: "QA_REPLAY", nameAr: "فصل مؤقت", nameDe: "QA Wiederholung", capacity: 6,
    };
    const options = { method: "POST", token: admin, persona: "admin", key: collisionKey, body: draft } as const;
    const results = await Promise.all([
      fixtureApi(school, "/school/classes", { ...options, status: [200, 201] }),
      fixtureApi(school, "/school/classes", { ...options, status: [200, 201] }),
    ]);
    assert.equal(results[0].payload.data.id, results[1].payload.data.id);
    const different = await fixtureApi(school, "/school/classes", { ...options, body: { ...draft, capacity: 7 }, status: 409 });
    assert.equal(different.payload.error.code, "idempotency_conflict");

    const slot = { assignmentId: offering.id, roomId: room.id, weekday: clock.weekday, start: 600, end: 660,
      from: clock.startsOn, untilExclusive: clock.endsExclusive };
    const review = { method: "POST", token: admin, persona: "admin" } as const;
    const confirmed = await fixtureApi(school, "/school/timetable/preview", { ...review, body: { yearId: year.id, slots: [slot] } });
    if (confirmed.payload.data.canSave) {
      await command("/school/timetable", "slot-a", {
        yearId: year.id, yearRevision: confirmed.payload.data.yearRevision, slots: [confirmed.payload.data.entries[0].slot],
      });
    }
    const clashes = await fixtureApi(school, "/school/timetable/preview", {
      ...review, body: { yearId: year.id, slots: [{ ...slot, start: 630, end: 690 }] },
    });
    assert.equal(clashes.payload.data.canSave, false);
    assert.ok(clashes.payload.data.entries[0].issues.some((issue: { kind: string }) => issue.kind === "clash"));

    // A second teacher may be linked to the same class without becoming
    // the sole attendance-responsible teacher or choosing a fixed subject.
    const { payload: listedStaff } = await fixtureApi(school,"/school/staff",{token:admin});
    const secondTeacher=listedStaff.data.find((row:{accountId:string})=>row.accountId===ids["teacher-other"]);
    assert.ok(secondTeacher);
    const support=await command(`/school/classes/${apple.id}/assignments`,"support-teacher",{
      staffId:secondTeacher.id,kind:"support",subjectId:null,
      from:clock.startsOn,untilExclusive:clock.endsExclusive,
      capabilities:["attendance.read","academics.plan","academics.log","academics.grade","academics.publish","comms.class"],
    });
    assert.equal(support.kind,"support");
    const { payload: subjects } = await fixtureApi(school,"/school/subjects",{token:admin});
    const subject=subjects.data.find((row:{code:string})=>row.code==="FIQH");
    assert.ok(subject);
    const nextDay=(clock.weekday%7)+1, thirdDay=(nextDay%7)+1;
    const batch=[clock.weekday,nextDay,thirdDay].map(weekday=>({
      assignmentId:support.id,subjectId:subject.id,roomId:room.id,
      weekday,start:840,end:900,from:clock.startsOn,untilExclusive:clock.endsExclusive,
    }));
    const prepared=await fixtureApi(school,"/school/timetable/preview",{
      ...review,body:{yearId:year.id,slots:batch},
    });
    assert.equal(prepared.payload.data.canSave,true);
    const bulk=await command("/school/timetable","batch-days",{
      yearId:year.id,yearRevision:prepared.payload.data.yearRevision,
      slots:prepared.payload.data.entries.map((entry:{slot:unknown})=>entry.slot),
    });
    assert.equal(bulk.ids.length,3);
    const currentDate=clock.day;
    const nextDate=new Date(currentDate+"T12:00:00Z");
    nextDate.setUTCDate(nextDate.getUTCDate()+1);
    const dayAfter=nextDate.toISOString().slice(0,10);
    const changed={...batch[0],start:930,end:990,from:currentDate,untilExclusive:dayAfter};
    const onePreview=await fixtureApi(school,"/school/timetable/preview",{
      ...review,body:{yearId:year.id,editingId:bulk.ids[0],slots:[changed]},
    });
    assert.equal(onePreview.payload.data.canSave,true);
    await command(`/school/timetable/${bulk.ids[0]}`,"one-lesson",{
      revision:1,date:currentDate,scope:"single",
      yearRevision:onePreview.payload.data.yearRevision,slot:onePreview.payload.data.entries[0].slot,
    },"PATCH");
    const weekNow=await fixtureApi(school,`/school/timetable?weekOf=${clock.weekOf}&classId=${apple.id}`,{token:admin});
    assert.ok(weekNow.payload.data.slots.some((slot:{id:string;start:number})=>slot.id===bulk.ids[0]&&slot.start===930));
    // A later recurring proposal must respect the changed single occurrence,
    // not merely the original recurring time range.
    const movedClash=await fixtureApi(school,"/school/timetable/preview",{
      ...review,body:{yearId:year.id,slots:[{
        assignmentId:offering.id,roomId:room.id,weekday:clock.weekday,
        start:950,end:980,from:clock.startsOn,untilExclusive:clock.endsExclusive,
      }]},
    });
    assert.equal(movedClash.payload.data.canSave,false);
    assert.ok(movedClash.payload.data.entries[0].issues.some((issue:{kind:string})=>issue.kind==="clash"));
    const followingWeek=new Date(clock.weekOf+"T12:00:00Z");
    followingWeek.setUTCDate(followingWeek.getUTCDate()+7);
    const nextMonday=followingWeek.toISOString().slice(0,10);
    const weekLater=await fixtureApi(school,`/school/timetable?weekOf=${nextMonday}&classId=${apple.id}`,{token:admin});
    assert.ok(weekLater.payload.data.slots.some((slot:{id:string;start:number})=>slot.id===bulk.ids[0]&&slot.start===840));
    await command(`/school/timetable/${bulk.ids[0]}`,"future-cancel",{
      revision:2,date:nextMonday===currentDate?currentDate: (()=>{const d=new Date(currentDate+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10);})(),
      scope:"future",cancel:true,
    },"PATCH");
    const gone=await fixtureApi(school,`/school/timetable?weekOf=${nextMonday}&classId=${apple.id}`,{token:admin});
    assert.equal(gone.payload.data.slots.some((slot:{id:string})=>slot.id===bulk.ids[0]),false);

    const teacher = await school.bearer("teacher", "teacher");
    const guardian = await school.bearer("guardian-ar", "guardian");
    const { payload: roster } = await fixtureApi(school, `/school/classes/${apple.id}/roster?date=${clock.day}`, { token: admin });
    assert.deepEqual(new Set(roster.data.rows.map((entry: { enrollment: { studentId: string } }) => entry.enrollment.studentId)),
      new Set([ids.ahmed, ids.omar]));
    const { payload: teacherWeek } = await fixtureApi(school, `/school/timetable?weekOf=${clock.weekOf}`, { token: teacher });
    assert.ok(teacherWeek.data.slots.some((entry: { date: string; classId: string }) => entry.date === clock.day && entry.classId === apple.id));
    const { payload: parentWeek } = await fixtureApi(school, `/school/timetable?weekOf=${clock.weekOf}&childId=${ids.ahmed}`, { token: guardian });
    assert.ok(parentWeek.data.slots.length >= 2);
    assert.ok(parentWeek.data.slots.every((entry: {classId:string})=>entry.classId===apple.id));
    const { payload: queue } = await fixtureApi(school, "/school/work-queues", { token: admin });
    assert.ok(queue.data);
    console.info("Replay request IDs", results.map(({ trace }) => trace).join(","));
  } finally {
    await school.close();
  }
});

test("a dual-role member can switch in one session and access cannot be raised by a header", async () => {
  const school = schoolFixtures();
  try {
    const token = await school.bearer("dual-role", "guardian");
    const { payload: original } = await fixtureApi(school, "/auth/session", { token });
    assert.equal(original.data.activePersona, "guardian");
    await fixtureApi(school, "/me/children", { token, persona: "admin", status: 403 });
    const { payload: switched } = await fixtureApi(school, "/auth/persona", {
      token, persona: "guardian", method: "POST", body: { persona: "teacher" },
    });
    assert.equal(switched.data.activePersona, "teacher");
    await fixtureApi(school, "/me/children", { token, persona: "guardian", status: 403 });
    await fixtureApi(school, "/school/classes", {
      token, persona: "teacher", method: "POST", key: randomUUID(), body: {}, status: [403, 422],
    });
  } finally {
    await school.close();
  }
});

test("a dated substitute sees the delegated class and a cancelled lesson day stays closed", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    const { year, apple, primary, substitute } = await setUpCalendar(school, admin);
    await fixtureApi(school, `/school/assignments/${primary.id}/substitutes`, {
      method: "POST", token: admin, persona: "admin", key: `${school.run}.substitute`, status: [200, 201],
      body: {
        staffId: substitute.id, from: clock.day, untilExclusive: clock.holiday, revision: primary.revision,
        capabilities: ["attendance.read", "attendance.mark"],
      },
    });
    const delegated = await school.bearer("substitute", "teacher");
    const teacher = await school.bearer("teacher", "teacher");
    const day = `/attendance/classes/${apple.id}/days/${clock.holiday}`;
    await fixtureApi(school, `/attendance/classes/${apple.id}/days/${clock.day}`, { token: delegated });
    await fixtureApi(school, day, { token: delegated, status: 404 });
    await fixtureApi(school, `/school/years/${year.id}/days/${clock.holiday}`, {
      method: "PUT", token: admin, persona: "admin", key: `${school.run}.school-holiday`,
      body: { classId: apple.id, teaching: false, reason: "QA calendar exception", revision: 0 },
    });
    const closed = await fixtureApi(school, day, { token: teacher });
    assert.equal(closed.payload.data.teachingDay, false);
    assert.equal(closed.payload.data.state, "unstarted");
    const error = await fixtureApi(school, `${day}/open`, {
      method: "POST", token: teacher, persona: "teacher", key: `${school.run}.attempt-open-holiday`, status: 409,
    });
    assert.equal(error.payload.error.code, "closed_day");
  } finally {
    await school.close();
  }
});
