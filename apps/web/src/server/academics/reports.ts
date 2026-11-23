import "server-only";
import { academicReport,reportEnrollment,reportPupil,reportSource,reportSubject,
  type academicReportQuery,type reportStudentSearch,type ReportSource } from "@madrasty/contracts";
import type { z } from "zod";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { academicReadScope } from "./curriculum";

type Period=z.infer<typeof academicReportQuery>;

async function reportAccess(tx:Transaction,actor:ActorContext,child?:string){
  if(actor.persona==="admin")throw new ApiError("forbidden");
  if(actor.persona==="guardian"){
    if(!child)throw new ApiError("forbidden");
    await academicReadScope(tx,actor,child);
  }else await academicReadScope(tx,actor);
}
export function searchReportStudents(actor:ActorContext,input:z.infer<typeof reportStudentSearch>){
  return withActor(actor,async(tx)=>{
    await reportAccess(tx,actor);
    const rows=reportPupil.array().parse(await tx`select student_id as id,student_name as "displayName",student_number as "studentNumber"
      from app.report_pupils(null,${input.classId??null}::uuid,${input.from}::date,${input.to}::date,${input.query||null}::text)
      where (${input.cursor??null}::uuid is null or student_id>${input.cursor??null}::uuid)
      order by student_id limit ${input.limit+1}`);
    return {items:rows.slice(0,input.limit),nextCursor:rows.length>input.limit?rows[input.limit-1].id:undefined};
  });
}

function markedTotals(rows:ReportSource[],kind:"activity"|"exam"){
  const included=rows.filter((row)=>row.kind===kind&&row.included&&row.numerator!==null&&row.maximum!==null);
  const sum=(key:"numerator"|"maximum")=>included.reduce((total,row)=>total+Math.round((row[key]??0)*10000),0)/10000;
  return {count:included.length,earned:sum("numerator"),possible:sum("maximum")};
}
function assessmentScale(rows:ReportSource[],key:"participation"|"understanding"|"preparation"){
  const marks=rows.flatMap((row)=>row.kind==="evaluation"&&row[key]!==null?[row[key]]:[]);
  return {count:marks.length,average:marks.length?marks.reduce((total,mark)=>total+mark,0)/marks.length:null};
}
function groupFor(subjectId:string,rows:ReportSource[]){
  const homework=rows.filter((row)=>row.kind==="homework");
  const recorded=homework.flatMap((row)=>row.included&&row.numerator!==null?[row.numerator]:[]);
  return {subjectId,teachingCount:rows.filter((row)=>row.kind==="teaching").length,
    homework:{assigned:homework.length,scored:recorded.length,mean:recorded.length?recorded.reduce((total,points)=>total+points,0)/recorded.length:null},
    activities:markedTotals(rows,"activity"),exams:markedTotals(rows,"exam"),
    evaluations:{participation:assessmentScale(rows,"participation"),understanding:assessmentScale(rows,"understanding"),
      preparation:assessmentScale(rows,"preparation")},
  };
}
function attendanceFor(sources:ReportSource[]){
  const counts={days:0,present:0,late:0,absent_unexcused:0,absent_excused:0,cancelled:0};
  for(const row of sources){
    if(row.kind!=="attendance"||!row.status||row.status==="oral"||row.status==="written")continue;
    if(row.status==="cancelled"){counts.cancelled++;continue;}
    if(row.included){counts[row.status]++;counts.days++;}
  }
  return counts;
}
export function readAcademicReport(actor:ActorContext,pupil:string,input:Period){
  return withActor(actor,async(tx)=>{
    await reportAccess(tx,actor,pupil);
    const [report]=await tx`
      select jsonb_build_object('id',child.student_id,'displayName',child.student_name,'studentNumber',child.student_number) as student,
        coalesce((select jsonb_agg(jsonb_build_object(
          'enrollmentId',e.enrollment_id,'classId',e.class_id,'classCode',e.class_code,'classNameAr',e.class_name_ar,'classNameDe',e.class_name_de,
          'yearId',e.year_id,'yearStart',e.year_start,'yearEnd',e.year_end,'enrolledFrom',e.enrolled_from,'enrolledUntil',e.enrolled_until
        ) order by e.enrolled_from,e.enrollment_id)
          from app.report_enrollment_context(child.student_id,null,${input.from}::date,${input.to}::date) e),'[]'::jsonb) as enrollments,
        coalesce((select jsonb_agg(jsonb_build_object('id',s.subject_id,'nameAr',s.subject_name_ar,'nameDe',s.subject_name_de) order by s.subject_id)
          from app.report_subjects(child.student_id,${input.from}::date,${input.to}::date) s),'[]'::jsonb) as subjects,
        coalesce((select jsonb_agg(jsonb_build_object(
          'kind',r.source_kind,'sourceId',r.source_id,'resourceId',r.resource_id,'offeringId',r.offering_id,'subjectId',r.subject_id,
          'classId',r.class_id,'yearId',r.year_id,'enrollmentId',r.enrollment_id,'date',r.school_date,'periodFrom',r.period_from,
          'titleAr',r.title_ar,'titleDe',r.title_de,'status',r.status,'numerator',r.numerator,'maximum',r.maximum,
          'participation',r.participation,'understanding',r.understanding,'preparation',r.preparation,'revision',r.revision,
          'included',r.included,'inclusionReason',r.inclusion_reason,'visibility',r.visibility
        ) order by r.school_date desc,r.source_kind,r.source_id)
          from app.academic_report_sources(child.student_id,${input.from}::date,${input.to}::date,${input.subjectId??null}::uuid) r),'[]'::jsonb) as sources
      from app.report_pupils(${pupil},null,${input.from}::date,${input.to}::date,null) child`;
    if(!report)throw new ApiError("not_found");
    const subjects=reportSubject.array().parse(report.subjects);
    if(input.subjectId&&!subjects.some((subject)=>subject.id===input.subjectId))throw new ApiError("not_found");
    const sources=reportSource.array().parse(report.sources);
    const bySubject=new Map<string,ReportSource[]>();
    for(const row of sources){
      if(!row.subjectId)continue;
      const group=bySubject.get(row.subjectId)??[];
      group.push(row);bySubject.set(row.subjectId,group);
    }
    const displayed=input.subjectId?[input.subjectId]:subjects.map((item)=>item.id);
    return academicReport.parse({
      from:input.from,to:input.to,subjectId:input.subjectId??null,
      student:reportPupil.parse(report.student),enrollments:reportEnrollment.array().parse(report.enrollments),subjects,sources,
      groups:displayed.map((id)=>groupFor(id,bySubject.get(id)??[])),attendance:attendanceFor(sources),
    });
  });
}
