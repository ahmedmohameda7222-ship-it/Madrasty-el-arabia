package de.madrasty.app.identity

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.academics.CurriculumScreen
import de.madrasty.app.academics.AcademicReportScreen
import de.madrasty.app.academics.ReportTarget
import de.madrasty.app.academics.EvaluationScreen
import de.madrasty.app.academics.ExamScreen
import de.madrasty.app.academics.HomeworkScreen
import de.madrasty.app.academics.GradebookScreen
import de.madrasty.app.academics.TeachingActivityScreen
import de.madrasty.app.attendance.AttendanceHistoryScreen
import de.madrasty.app.attendance.DailySheetScreen
import de.madrasty.app.attendance.FamilyExcuseScreen
import de.madrasty.app.attendance.OfflineAttendanceScreen
import de.madrasty.app.attendance.SupervisorAttendanceScreen
import de.madrasty.app.comms.ThreadInbox
import de.madrasty.app.comms.ThreadScreen
import de.madrasty.app.school.AuditDestination
import de.madrasty.app.school.AuditFilters
import de.madrasty.app.school.AuditScreen
import de.madrasty.app.school.CalendarScreen
import de.madrasty.app.school.ChildrenScreen
import de.madrasty.app.school.EnrollmentScreen
import de.madrasty.app.school.FamiliesScreen
import de.madrasty.app.school.ImportScreen
import de.madrasty.app.school.SchoolHomeScreen
import de.madrasty.app.school.SchoolWorkQueueScreen
import de.madrasty.app.school.SchoolWorkTarget
import de.madrasty.app.school.StaffAssignmentsScreen
import de.madrasty.app.school.TimetableScreen
import de.madrasty.app.school.WorkQueueSelection
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.SchoolShell
import de.madrasty.app.ui.SchoolTab
import kotlinx.coroutines.CancellationException

internal sealed interface WorkspacePage {
    data object Tabs : WorkspacePage
    data object Apply : WorkspacePage
    data object Account : WorkspacePage
    data object Security : WorkspacePage
    data object Directory : WorkspacePage
    data class Thread(val id:String) : WorkspacePage
    data object Access : WorkspacePage
    data object Calendar : WorkspacePage
    data object Enrollment : WorkspacePage
    data object Applications : WorkspacePage
    data class AttendanceReview(val classId:String?=null,val date:String?=null) : WorkspacePage
    data class AttendanceHistory(val child:String?=null,val classId:String?=null,val rowId:String?=null) : WorkspacePage
    data object OfflineAttendance : WorkspacePage
    data object Audit : WorkspacePage
    data class Excuse(val child: String,val date:String?=null) : WorkspacePage
    data class Curriculum(val child:String?=null,val lesson:String?=null) : WorkspacePage
    data class Homework(val child:String?=null,val work:String?=null) : WorkspacePage
    data class Gradebook(val work:String?=null) : WorkspacePage
    data class AcademicWork(val child:String?=null,val activity:String?=null) : WorkspacePage
    data class Report(val pupil:String?=null) : WorkspacePage
    data class Evaluations(val child:String?=null,val entry:String?=null) : WorkspacePage
    data class Exams(val child:String?=null,val entry:String?=null) : WorkspacePage
    data class Timetable(val child: String? = null) : WorkspacePage
    data class Invitations(val batch: String? = null) : WorkspacePage
    data class Import(val job: String? = null) : WorkspacePage
    data class Assignments(val classTarget: SchoolWorkTarget.ClassAssignment? = null) : WorkspacePage
    data class Family(val student: String? = null,val guardian: String? = null,val link: String? = null) : WorkspacePage
    data class Queue(val selection: WorkQueueSelection) : WorkspacePage
}

@Stable
internal class SchoolNavigation {
    var page by mutableStateOf<WorkspacePage>(WorkspacePage.Tabs)
        private set
    private val previous = mutableListOf<WorkspacePage>()
    var tab by mutableStateOf(SchoolTab.Home)
    var child by mutableStateOf<String?>(null)
    var attendanceClass by mutableStateOf<String?>(null)
    var attendanceDate by mutableStateOf<String?>(null)
    var workDate by mutableStateOf("")
    var auditEntry by mutableStateOf<String?>(null)
    var auditFilters by mutableStateOf(AuditFilters())

    fun open(next: WorkspacePage) {
        previous.add(page)
        page = next
    }
    fun back() {
        page = previous.removeLastOrNull() ?: WorkspacePage.Tabs
    }
    fun choose(next: SchoolTab) {
        tab = next
        attendanceClass = null
        attendanceDate = null
    }
    fun openWork(target: SchoolWorkTarget) {
        open(when(target){
            is SchoolWorkTarget.ClassAssignment -> WorkspacePage.Assignments(target)
            is SchoolWorkTarget.FamilyImport -> WorkspacePage.Import(target.jobId)
            is SchoolWorkTarget.GuardianLink -> WorkspacePage.Family(guardian=target.guardianId,link=target.linkId)
        })
    }
    fun openThread(id:String)=open(WorkspacePage.Thread(id))
    fun openReportSource(target:ReportTarget){
        val next=when(target.kind){
            "attendance"->if(target.child==null)WorkspacePage.AttendanceHistory(rowId=target.id) else WorkspacePage.AttendanceHistory(child=target.child)
            "teaching"->WorkspacePage.Curriculum(target.child,target.id)
            "activity"->WorkspacePage.AcademicWork(target.child,target.id)
            "homework"->WorkspacePage.Homework(target.child,target.id)
            "evaluation"->WorkspacePage.Evaluations(target.child,target.id)
            "exam"->WorkspacePage.Exams(target.child,target.id)
            else->return
        }
        open(next)
    }
    fun openAuditResource(target: AuditDestination) {
        val next = when(target.kind){
            "access" -> WorkspacePage.Access
            "calendar" -> WorkspacePage.Calendar
            "assignments" -> WorkspacePage.Assignments()
            "class" -> {
                val classId=target.id ?: return
                val yearId=target.yearId ?: return
                WorkspacePage.Assignments(SchoolWorkTarget.ClassAssignment(classId,yearId))
            }
            "timetable" -> WorkspacePage.Timetable()
            "invitations" -> WorkspacePage.Invitations()
            "applications" -> WorkspacePage.Applications
            "import" -> WorkspacePage.Import(target.id ?: return)
            "student" -> WorkspacePage.Family(student=target.id ?: return)
            "guardian" -> WorkspacePage.Family(guardian=target.id ?: return,link=target.linkId)
            else -> return
        }
        open(next)
    }
}

private data class SchoolRights(val persona: Persona,val keys: Set<String>) {
    val school = "school.manage" in keys
    val students = "students.manage" in keys
    val applications = "applications.manage" in keys
    val academic = "academics.supervise" in keys
    val attendance = "attendance.supervise" in keys
    val access = "access.manage" in keys
    val audit = "audit.read" in keys

    fun allows(page: WorkspacePage): Boolean = when(page){
        WorkspacePage.Access -> access
        WorkspacePage.Audit -> audit
        WorkspacePage.Calendar -> school
        WorkspacePage.Enrollment -> school || students
        WorkspacePage.Applications -> applications
        is WorkspacePage.AttendanceReview -> attendance
        is WorkspacePage.AttendanceHistory -> if(page.child!=null)persona==Persona.Guardian else persona==Persona.Teacher||attendance
        is WorkspacePage.Assignments -> school || academic
        is WorkspacePage.Import,is WorkspacePage.Family -> students
        is WorkspacePage.Invitations -> students || applications
        is WorkspacePage.Queue -> persona == Persona.Admin
        is WorkspacePage.Gradebook -> persona==Persona.Teacher||academic
        is WorkspacePage.Homework -> if(page.child!=null)persona==Persona.Guardian else persona!=Persona.Admin||academic
        is WorkspacePage.Exams -> if(page.child!=null)persona==Persona.Guardian else persona!=Persona.Admin||academic
        is WorkspacePage.Evaluations -> if(page.child!=null)persona==Persona.Guardian else persona!=Persona.Admin||academic
        is WorkspacePage.Report -> persona!=Persona.Admin||academic
        is WorkspacePage.AcademicWork -> if(page.child!=null)persona==Persona.Guardian else persona!=Persona.Admin||academic
        is WorkspacePage.Curriculum -> if(page.child!=null)persona==Persona.Guardian else persona!=Persona.Admin||academic
        is WorkspacePage.Timetable -> persona != Persona.Admin || school || academic
        is WorkspacePage.Excuse -> persona == Persona.Guardian
        else -> true
    }
}

@Composable
internal fun SchoolWorkspace(model: IdentityViewModel,session: SchoolSession,state: SchoolNavigation) {
    var capabilities by remember(session.actor) { mutableStateOf(emptySet<String>()) }
    LaunchedEffect(session.actor,session.assurance) {
        if (session.actor.persona == Persona.Admin && session.assurance == "aal2") {
            capabilities = try { model.capabilities() }
            catch (error: CancellationException) { throw error }
            catch (_: Exception) { emptySet() }
        }
    }
    if (session.actor.persona == Persona.Admin && session.assurance != "aal2") {
        SecurityScreen(model,session) { if(state.page==WorkspacePage.Security)state.back() }
        return
    }
    val rights=SchoolRights(session.actor.persona,capabilities)
    val resume=model.attendanceResume
    LaunchedEffect(resume,session.actor){
        if(resume!=null){
            model.pickAttendanceResume(null)
            val parts=resume.split('/')
            if(parts.size==3){
                val (kind,id,date)=parts
                if(kind=="excuse"&&session.actor.persona==Persona.Guardian)state.open(WorkspacePage.Excuse(id,date))
                else if(kind=="sheet"&&session.actor.persona==Persona.Teacher){
                    state.attendanceClass=id
                    state.attendanceDate=date
                    state.tab=SchoolTab.Attendance
                }
            }
        }
    }
    val page=state.page
    if(!rights.allows(page)){
        BackHandler(onBack=state::back)
        Column(Modifier.fillMaxSize().safeDrawingPadding().padding(20.dp)) {
            AsyncSurface<Unit>(AsyncState.Forbidden(state::back)) {}
        }
        return
    }
    when(page){
        WorkspacePage.Tabs -> SchoolTabs(model,session,state,rights)
        WorkspacePage.Apply -> Unit
        WorkspacePage.Account -> AccountScreen(model,state::back) { state.open(WorkspacePage.Security) }
        WorkspacePage.Security -> SecurityScreen(model,session,state::back)
        WorkspacePage.Directory -> DirectoryScreen(model,state::openThread,state::back)
        is WorkspacePage.Thread -> ThreadScreen(model,page.id,state::openReportSource,state::back)
        WorkspacePage.Access -> StaffAccessScreen(model,session,state::back)
        WorkspacePage.Calendar -> CalendarScreen(model,state::back)
        WorkspacePage.Enrollment -> EnrollmentScreen(model,rights.school,rights.students,state::back)
        WorkspacePage.Applications -> TeacherApplicationReview(model,state::back)
        is WorkspacePage.AttendanceReview -> SupervisorAttendanceScreen(model,page.classId,page.date,
            openOffline={state.open(WorkspacePage.OfflineAttendance)},openHistory={classId,rowId->
                state.open(WorkspacePage.AttendanceHistory(classId=classId,rowId=rowId))},close=state::back)
        is WorkspacePage.AttendanceHistory -> AttendanceHistoryScreen(model,page.child,page.classId,page.rowId,
            {child,date->state.open(WorkspacePage.Excuse(child,date))},state::openThread,state::back)
        WorkspacePage.OfflineAttendance -> OfflineAttendanceScreen(model,session,state::back)
        WorkspacePage.Audit -> AuditScreen(
            model,state.auditEntry,{state.auditEntry=it},state.auditFilters,{state.auditFilters=it},state::openAuditResource,state::back,
        )
        is WorkspacePage.Excuse -> FamilyExcuseScreen(model,page.child,page.date,state::back)
        is WorkspacePage.Exams -> ExamScreen(model,session.actor.persona,page.child,page.entry,state::back)
        is WorkspacePage.Evaluations -> EvaluationScreen(model,session.actor.persona,page.child,page.entry,state::back)
        is WorkspacePage.AcademicWork -> TeachingActivityScreen(model,session.actor.persona,page.child,page.activity,state::back)
        is WorkspacePage.Report -> AcademicReportScreen(model,session.actor.persona,page.pupil,state::openReportSource,state::back)
        is WorkspacePage.Curriculum -> CurriculumScreen(model,session.actor.persona,page.child,page.lesson,state::back)
        is WorkspacePage.Homework -> HomeworkScreen(model,session.actor.persona,page.child,page.work,
            {child,lesson->state.open(WorkspacePage.Curriculum(child,lesson))},{state.open(WorkspacePage.Gradebook(it))},state::openThread,state::back)
        is WorkspacePage.Gradebook -> GradebookScreen(model,page.work,{state.open(WorkspacePage.Homework(work=it))},state::back)
        is WorkspacePage.Timetable -> TimetableScreen(model,session.actor.persona,page.child,state::back)
        is WorkspacePage.Assignments -> StaffAssignmentsScreen(model,page.classTarget,state::back)
        is WorkspacePage.Invitations -> StaffInvitationsScreen(model,rights.applications,page.batch,state::back)
        is WorkspacePage.Import -> ImportScreen(model,{state.open(WorkspacePage.Invitations(it))},page.job,state::back)
        is WorkspacePage.Family -> FamilyWorkspace(model,page,state::back)
        is WorkspacePage.Queue -> SchoolWorkQueueScreen(model,page.selection,state::openWork,state::back)
    }
}

@Composable
private fun SchoolTabs(model:IdentityViewModel,session:SchoolSession,state:SchoolNavigation,rights:SchoolRights){
    SchoolShell(session.actor,state.tab,state::choose){tab->
        Text(stringResource(tab.label),Modifier.semantics{heading()},style=MaterialTheme.typography.headlineMedium)
        when(tab){
            SchoolTab.Home -> SchoolHomeScreen(
                model,session.actor.persona,state.workDate,{state.workDate=it},
                openQueue={state.open(WorkspacePage.Queue(it))},
                openDirectory={state.open(WorkspacePage.Directory)},
                child=state.child,pickChild={state.child=it},
                openProfile={state.child=it;state.tab=SchoolTab.Children},
                openAttendance={state.attendanceClass=it;state.tab=SchoolTab.Attendance},
                openSchedule={state.open(WorkspacePage.Timetable(it))},
            )
            SchoolTab.Attendance -> DailySheetScreen(model,initialClass=state.attendanceClass,initialDate=state.attendanceDate,
                openOffline={state.open(WorkspacePage.OfflineAttendance)},openHistory={classId,rowId->
                    state.open(WorkspacePage.AttendanceHistory(classId=classId,rowId=rowId))})
            SchoolTab.Children -> ChildrenScreen(model,state.child,{state.child=it},
                openTimetable={state.open(WorkspacePage.Timetable(it))},openExcuse={state.open(WorkspacePage.Excuse(it))},
                openHistory={state.open(WorkspacePage.AttendanceHistory(child=it))},
                openCurriculum={state.open(WorkspacePage.Curriculum(it))},openActivities={state.open(WorkspacePage.AcademicWork(it))},
                openHomework={state.open(WorkspacePage.Homework(it))},openEvaluations={state.open(WorkspacePage.Evaluations(it))},
                openExams={state.open(WorkspacePage.Exams(it))},openReport={state.open(WorkspacePage.Report(it))})
            SchoolTab.Students -> if(rights.students){
                OpenPage(state,WorkspacePage.Import(),R.string.import_families)
                FamiliesScreen(model)
            }
            SchoolTab.More -> SchoolSettings(model,session,state,rights)
            SchoolTab.Messages -> ThreadInbox(model,{state.open(WorkspacePage.Directory)},state::openThread)
        }
    }
}

@Composable
private fun FamilyWorkspace(model:IdentityViewModel,page:WorkspacePage.Family,close:()->Unit){
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        FamiliesScreen(model,initialStudent=page.student,initialGuardian=page.guardian,initialLink=page.link)
    }
}

@Composable
private fun SchoolSettings(model:IdentityViewModel,session:SchoolSession,state:SchoolNavigation,rights:SchoolRights){
    Text(stringResource(R.string.settings_group_account),style=MaterialTheme.typography.titleLarge)
    OpenPage(state,WorkspacePage.Security,R.string.security)
    OpenPage(state,WorkspacePage.Account,R.string.account_preferences)
    OpenPage(state,WorkspacePage.Directory,R.string.directory_title)
    OpenPage(state,WorkspacePage.OfflineAttendance,R.string.drafts_on_device)
    AccountActions(model,session)

    if(rights.persona!=Persona.Admin||rights.school||rights.students||rights.academic||rights.applications||rights.attendance){
        Text(stringResource(R.string.settings_group_school),style=MaterialTheme.typography.titleLarge)
        if(rights.allows(WorkspacePage.Gradebook()))OpenPage(state,WorkspacePage.Gradebook(),R.string.gradebook_title)
        if(rights.allows(WorkspacePage.Homework()))OpenPage(state,WorkspacePage.Homework(),R.string.homework_title)
        if(rights.allows(WorkspacePage.Report()))OpenPage(state,WorkspacePage.Report(),R.string.report_title)
        if(rights.allows(WorkspacePage.Exams()))OpenPage(state,WorkspacePage.Exams(),R.string.exam_title)
        if(rights.allows(WorkspacePage.Evaluations()))OpenPage(state,WorkspacePage.Evaluations(),R.string.evaluation_title)
        if(rights.allows(WorkspacePage.AcademicWork()))OpenPage(state,WorkspacePage.AcademicWork(),R.string.academic_work)
        if(rights.allows(WorkspacePage.Curriculum()))OpenPage(state,WorkspacePage.Curriculum(),R.string.curriculum_title)
        if(rights.allows(WorkspacePage.Timetable()))OpenPage(state,WorkspacePage.Timetable(),R.string.timetable_title)
        if(rights.school||rights.academic)OpenPage(state,WorkspacePage.Assignments(),R.string.staff_assignments)
        if(rights.attendance)OpenPage(state,WorkspacePage.AttendanceReview(),R.string.attendance_review)
        if(rights.school)OpenPage(state,WorkspacePage.Calendar,R.string.school_calendar)
        if(rights.school||rights.students)OpenPage(state,WorkspacePage.Enrollment,R.string.enrollments)
        if(rights.students||rights.applications)OpenPage(state,WorkspacePage.Invitations(),R.string.invite_title)
        if(rights.applications)OpenPage(state,WorkspacePage.Applications,R.string.teacher_apps)
        if(rights.persona==Persona.Guardian)OpenPage(state,WorkspacePage.Apply,R.string.teacher_apply)
    }
    if(rights.access||rights.audit){
        Text(stringResource(R.string.settings_group_access),style=MaterialTheme.typography.titleLarge)
        if(rights.access)OpenPage(state,WorkspacePage.Access,R.string.staff_access)
        if(rights.audit)TextButton(onClick={state.auditEntry=null;state.open(WorkspacePage.Audit)}){
            Text(stringResource(R.string.audit_title))
        }
    }
}

@Composable
private fun OpenPage(state:SchoolNavigation,page:WorkspacePage,label:Int){
    TextButton(onClick={state.open(page)}) { Text(stringResource(label)) }
}
