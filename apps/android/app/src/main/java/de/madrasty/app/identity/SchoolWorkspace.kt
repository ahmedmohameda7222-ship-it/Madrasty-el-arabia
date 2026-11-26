package de.madrasty.app.identity

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ListItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.stateDescription
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
import de.madrasty.app.comms.BroadcastHub
import de.madrasty.app.comms.NotificationAction
import de.madrasty.app.comms.NotificationCenter
import de.madrasty.app.comms.PushSessionBinding
import de.madrasty.app.comms.PublicationSection
import de.madrasty.app.comms.SchoolPublicationScreen
import de.madrasty.app.finance.BankSettings
import de.madrasty.app.finance.FeeSettings
import de.madrasty.app.finance.IssueInvoices
import de.madrasty.app.finance.InvoiceDetails
import de.madrasty.app.finance.RecordPayment
import de.madrasty.app.finance.Reconciliation
import de.madrasty.app.finance.ReceiptDetails
import de.madrasty.app.finance.FinanceReports
import de.madrasty.app.finance.StopQueue
import de.madrasty.app.finance.StopReview
import de.madrasty.app.finance.financeObject
import de.madrasty.app.navigation.SchoolResourceLink
import de.madrasty.app.navigation.SchoolResourceKind
import de.madrasty.app.navigation.navigationTarget
import de.madrasty.app.navigation.resolveSchoolResource
import de.madrasty.app.comms.ReportQueue
import de.madrasty.app.comms.mayReviewChatReports
import de.madrasty.app.comms.ThreadInbox
import de.madrasty.app.comms.CommunicationFeed
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.ui.res.painterResource
import de.madrasty.app.comms.ThreadInboxState
import de.madrasty.app.comms.ThreadScreen
import de.madrasty.app.school.CalendarScreen
import de.madrasty.app.school.ChildrenScreen
import de.madrasty.app.school.EnrollmentScreen
import de.madrasty.app.school.FamiliesScreen
import de.madrasty.app.school.ImportScreen
import de.madrasty.app.school.SchoolHomeScreen
import de.madrasty.app.school.AdminTasksScreen
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
import de.madrasty.app.ui.InterfaceLanguageWorkspace
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

internal sealed interface WorkspacePage {
    data object Tabs : WorkspacePage
    data object Account : WorkspacePage
    data object Profile : WorkspacePage
    data object Security : WorkspacePage
    data object Directory : WorkspacePage
    data class Thread(val id:String) : WorkspacePage
    data object MessageReports : WorkspacePage
    data object Bank : WorkspacePage
    data class FeeSettings(val student: String? = null) : WorkspacePage
    data class IssueInvoices(val student: String? = null) : WorkspacePage
    data class Invoices(val id: String? = null, val student: String? = null, val period: String? = null) : WorkspacePage
    data class Payment(val invoice: String? = null) : WorkspacePage
    data class Receipts(val id: String? = null, val state: String? = null) : WorkspacePage
    data class FinanceReport(val student: String? = null) : WorkspacePage
    data class Stops(val id: String? = null, val student: String? = null) : WorkspacePage
    data class StopReviews(val id: String? = null) : WorkspacePage
    data class Broadcasts(val announcement:String?=null) : WorkspacePage
    data class Notifications(val notice:String?=null) : WorkspacePage
    data class ResourceUnavailable(val retry: SchoolResourceLink? = null) : WorkspacePage
    data class Publication(val section:PublicationSection,val item:String?=null,val create:Boolean=false,val managed:Boolean=false) : WorkspacePage
    data object Access : WorkspacePage
    data object Calendar : WorkspacePage
    data class Enrollment(val student:String?=null) : WorkspacePage
    data class AttendanceReview(val classId:String?=null,val date:String?=null) : WorkspacePage
    data class AttendanceHistory(val child:String?=null,val classId:String?=null,val rowId:String?=null) : WorkspacePage
    data object OfflineAttendance : WorkspacePage
    data class Excuse(val child: String,val date:String?=null) : WorkspacePage
    data class Curriculum(val child:String?=null,val lesson:String?=null) : WorkspacePage
    data class Homework(val child:String?=null,val work:String?=null) : WorkspacePage
    data class Gradebook(val work:String?=null) : WorkspacePage
    data class AcademicWork(val child:String?=null,val activity:String?=null) : WorkspacePage
    data class Report(val pupil:String?=null) : WorkspacePage
    data class Evaluations(val child:String?=null,val entry:String?=null) : WorkspacePage
    data class Exams(val child:String?=null,val entry:String?=null) : WorkspacePage
    data class Timetable(val child: String? = null) : WorkspacePage
    data class Invitations(val batch: String? = null, val id: String? = null) : WorkspacePage
    data class Import(val job: String? = null) : WorkspacePage
    data class Assignments(val classTarget: SchoolWorkTarget.ClassAssignment? = null) : WorkspacePage
    data class Family(val student: String? = null,val guardian: String? = null,val link: String? = null,val addGuardian:Boolean = false) : WorkspacePage
    data object AdminTasks : WorkspacePage
    data class Queue(val selection: WorkQueueSelection) : WorkspacePage
}

@Stable
internal class SchoolNavigation {
    var communicationSection by mutableStateOf("chat")
    val inbox=ThreadInboxState()
    var page by mutableStateOf<WorkspacePage>(WorkspacePage.Tabs)
        private set
    private val previous = mutableListOf<WorkspacePage>()
    var tab by mutableStateOf(SchoolTab.Home)
    var child by mutableStateOf<String?>(null)
    var attendanceClass by mutableStateOf<String?>(null)
    var attendanceDate by mutableStateOf<String?>(null)
    var workDate by mutableStateOf("")

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
            is SchoolWorkTarget.BouncedInvite -> WorkspacePage.Invitations(id=target.id)
            is SchoolWorkTarget.AttendanceSheet -> WorkspacePage.AttendanceReview(target.classId,target.date)
            is SchoolWorkTarget.EnrollmentStop -> WorkspacePage.Stops(id=target.id)
            is SchoolWorkTarget.ReceiptMatch -> WorkspacePage.Receipts(id=target.id)
            is SchoolWorkTarget.ClassAssignment -> WorkspacePage.Assignments(target)
            is SchoolWorkTarget.FamilyImport -> WorkspacePage.Import(target.jobId)
            is SchoolWorkTarget.GuardianLink -> WorkspacePage.Family(guardian=target.guardianId,link=target.linkId)
        })
    }
    fun openThread(id:String)=open(WorkspacePage.Thread(id))
    fun openNoticeTarget(target:JSONObject):Boolean{
        val id=target.getString("id")
        val childId=target.optString("childId").takeIf{it.isNotBlank()}
        val page=when(target.getString("kind")){
            "thread"->WorkspacePage.Thread(id)
            "broadcast"->WorkspacePage.Broadcasts(id)
            "child"->{
                back()
                choose(SchoolTab.Children)
                child=id
                return true
            }
            "attendance"->WorkspacePage.AttendanceHistory(child=childId,rowId=id)
            "exam"->WorkspacePage.Exams(childId,id)
            "evaluation"->WorkspacePage.Evaluations(childId,id)
            "activity"->WorkspacePage.AcademicWork(childId,id)
            "homework"->WorkspacePage.Homework(childId,id)
            "invoice"->WorkspacePage.Invoices(id=id)
            "receipt"->WorkspacePage.Receipts(id=id)
            "fee_stop"->WorkspacePage.Stops(id=id)
            else->return false
        }
        open(page)
        return true
    }
    fun openReportSource(target:ReportTarget){
        val next=when(target.kind){
            "attendance"->if(target.child==null)WorkspacePage.AttendanceHistory(rowId=target.id) else WorkspacePage.AttendanceHistory(child=target.child)
            "teaching"->WorkspacePage.Curriculum(target.child,target.id)
            "activity"->WorkspacePage.AcademicWork(target.child,target.id)
            "homework"->WorkspacePage.Homework(target.child,target.id)
            "invoice"->WorkspacePage.Invoices(id=target.id)
            "evaluation"->WorkspacePage.Evaluations(target.child,target.id)
            "exam"->WorkspacePage.Exams(target.child,target.id)
            else->return
        }
        open(next)
    }
}

private data class SchoolRights(val persona: Persona,val keys: Set<String>,val moderation:Boolean,val stopManager:Boolean) {
    val school = "school.manage" in keys
    val students = "students.manage" in keys
    val teacherInvites = "staff.invite" in keys
    val academic = "academics.supervise" in keys
    val attendance = "attendance.supervise" in keys
    val access = "access.manage" in keys
    val bank = "bank.configure" in keys
    val billing = "finance.issue" in keys
    val posting = "finance.post" in keys
    val receiptViewer = posting || "finance.read" in keys
    val invoiceViewer = persona == Persona.Guardian || billing || receiptViewer

    fun allows(page: WorkspacePage): Boolean = when(page){
        WorkspacePage.Access -> access
        WorkspacePage.MessageReports -> moderation
        WorkspacePage.Bank -> bank
        is WorkspacePage.FeeSettings, is WorkspacePage.IssueInvoices -> billing
        is WorkspacePage.Invoices -> invoiceViewer
        is WorkspacePage.Payment -> posting
        is WorkspacePage.Receipts -> receiptViewer || (page.id != null && persona == Persona.Guardian)
        is WorkspacePage.FinanceReport -> receiptViewer || persona == Persona.Guardian
        is WorkspacePage.Stops -> stopManager || persona == Persona.Guardian
        is WorkspacePage.StopReviews -> receiptViewer
        WorkspacePage.Calendar -> school
        is WorkspacePage.Enrollment -> school || students
        is WorkspacePage.AttendanceReview -> attendance
        is WorkspacePage.AttendanceHistory -> if(page.child!=null)persona==Persona.Guardian else persona==Persona.Teacher||attendance
        is WorkspacePage.Assignments -> school || academic
        is WorkspacePage.Import,is WorkspacePage.Family -> students
        is WorkspacePage.Invitations -> students || teacherInvites
        WorkspacePage.AdminTasks, is WorkspacePage.Queue -> persona == Persona.Admin
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
    var moderation by remember(session.actor) { mutableStateOf(false) }
    var stopManager by remember(session.actor) { mutableStateOf(false) }
    LaunchedEffect(session.actor,session.assurance) {
        if (session.actor.persona == Persona.Admin && session.assurance == "aal2") {
            capabilities = try { model.capabilities() }
            catch (error: CancellationException) { throw error }
            catch (_: Exception) { emptySet() }
            moderation=try{model.mayReviewChatReports()}
            catch(error:CancellationException){throw error}
            catch(_:Exception){false}
            stopManager=try{model.financeObject("/enrollment-stops/options").getBoolean("mayDecide")}
            catch(error:CancellationException){throw error}
            catch(_:Exception){false}
        }
    }
    if (session.actor.persona == Persona.Admin && session.assurance != "aal2") {
        InterfaceLanguageWorkspace { SecurityScreen(model,session) { if(state.page==WorkspacePage.Security)state.back() } }
        return
    }
    val rights=SchoolRights(session.actor.persona,capabilities,moderation,stopManager)
    PushSessionBinding(model,session)
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
    val pending = model.pendingSchoolResource
    LaunchedEffect(pending,session.actor){
        if(pending==null)return@LaunchedEffect
        if(pending.accountId!=null&&pending.accountId!=session.actor.accountId){
            model.routeSchoolResource(null)
            return@LaunchedEffect
        }
        try{
            val link=model.resolveSchoolResource(pending.link)
            if(model.session?.actor!=session.actor||model.pendingSchoolResource!=pending)return@LaunchedEffect
            if(link.kind==SchoolResourceKind.NOTICE)state.open(WorkspacePage.Notifications(link.id))
            else if(!state.openNoticeTarget(link.navigationTarget()))state.open(WorkspacePage.ResourceUnavailable())
            model.routeSchoolResource(null)
        }catch(error:CancellationException){throw error}
        catch(error:Exception){
            if(model.session?.actor!=session.actor||model.pendingSchoolResource!=pending)return@LaunchedEffect
            val denied=error is HttpFailure&&error.status in listOf(401,403,404)
            state.open(WorkspacePage.ResourceUnavailable(if(denied)null else pending.link))
            model.routeSchoolResource(null)
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
    if(page==WorkspacePage.Tabs){SchoolTabs(model,session,state,rights);return}
    if(page is WorkspacePage.Thread){ThreadScreen(model,page.id,state::openReportSource,state::back);return}
    InterfaceLanguageWorkspace {
    when(page){
        WorkspacePage.Tabs -> SchoolTabs(model,session,state,rights)
        WorkspacePage.Profile -> ProfileScreen(model,state::back)
        WorkspacePage.Account -> AccountScreen(model,state::back) { state.open(WorkspacePage.Security) }
        WorkspacePage.Security -> SecurityScreen(model,session,state::back)
        WorkspacePage.Directory -> DirectoryScreen(model,state::openThread,state::back)
        is WorkspacePage.Thread -> ThreadScreen(model,page.id,state::openReportSource,state::back)
        WorkspacePage.MessageReports -> ReportQueue(model,state::back)
        WorkspacePage.Bank -> BankSettings(model,state::back)
        is WorkspacePage.FeeSettings -> FeeSettings(model,page.student,state::back,if(rights.bank)({state.open(WorkspacePage.Bank)})else null)
        is WorkspacePage.IssueInvoices -> IssueInvoices(model,page.student,
            if(rights.bank) ({state.open(WorkspacePage.Bank)}) else null,
            {state.open(WorkspacePage.FeeSettings(it))}, {id,period->state.open(WorkspacePage.Invoices(id,period=period))},state::back)
        is WorkspacePage.Invoices -> InvoiceDetails(model,page.id,page.student,page.period,
            {state.open(WorkspacePage.Invoices(id=it))},state::openThread,
            {state.open(WorkspacePage.Receipts(id=it))},
            if(rights.posting) ({id->state.open(WorkspacePage.Payment(id))}) else null,state::back,if(rights.billing)({state.open(WorkspacePage.IssueInvoices(page.student))})else null)
        is WorkspacePage.Payment -> RecordPayment(model,page.invoice,{state.open(WorkspacePage.Receipts(id=it))},
            {state.open(WorkspacePage.Receipts())},state::back)
        is WorkspacePage.Receipts -> if(page.id!=null)ReceiptDetails(model,page.id,
            {state.open(WorkspacePage.Invoices(id=it))},state::back)
        else Reconciliation(model,page.state,rights.posting,{state.open(WorkspacePage.Payment())},
            {state.open(WorkspacePage.Receipts(id=it))},state::back,{state.open(WorkspacePage.StopReviews())})
        is WorkspacePage.FinanceReport -> FinanceReports(model,page.student,rights.receiptViewer,
            {state.open(WorkspacePage.Invoices(id=it))},{state.open(WorkspacePage.Receipts(id=it))},
            {state.open(WorkspacePage.Receipts(state="needs_matching"))},state::back,{student,period->state.open(WorkspacePage.Invoices(student=student,period=period))})
        is WorkspacePage.Stops -> StopQueue(model,page.id,page.student,rights.stopManager,
            {state.open(WorkspacePage.Stops(id=it))},state::back)
        is WorkspacePage.StopReviews -> StopReview(model,page.id,{state.open(WorkspacePage.StopReviews(it))},
            {state.open(WorkspacePage.Invoices(id=it))},{state.open(WorkspacePage.Receipts(id=it))},state::back)
        is WorkspacePage.Broadcasts -> BroadcastHub(model,session.actor.persona,page.announcement,state::back)
        is WorkspacePage.ResourceUnavailable -> {
            BackHandler(onBack=state::back)
            Column(Modifier.fillMaxSize().safeDrawingPadding().padding(20.dp)){
                val retry=page.retry
                val surface=if(retry==null)AsyncState.Forbidden(state::back) else AsyncState.Error(retry={
                    state.back()
                    model.routeSchoolResource(retry)
                })
                AsyncSurface(surface){}
            }
        }
        is WorkspacePage.Notifications -> NotificationCenter(model,page.notice,state::openNoticeTarget,
            {state.open(WorkspacePage.Account)},state::back)
        is WorkspacePage.Publication -> SchoolPublicationScreen(model,page.section,page.item,state::back,initialCreate=page.create,initialManaged=page.managed)
        WorkspacePage.Access -> StaffAccessScreen(model,session,state::back)
        WorkspacePage.Calendar -> CalendarScreen(model,state::back)
        is WorkspacePage.Enrollment -> EnrollmentScreen(model,rights.school,rights.students,state::back,page.student)
        is WorkspacePage.AttendanceReview -> SupervisorAttendanceScreen(model,page.classId,page.date,
            openOffline={state.open(WorkspacePage.OfflineAttendance)},openHistory={classId,rowId->
                state.open(WorkspacePage.AttendanceHistory(classId=classId,rowId=rowId))},close=state::back)
        is WorkspacePage.AttendanceHistory -> AttendanceHistoryScreen(model,page.child,page.classId,page.rowId,
            {child,date->state.open(WorkspacePage.Excuse(child,date))},state::openThread,state::back)
        WorkspacePage.OfflineAttendance -> OfflineAttendanceScreen(model,session,state::back)
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
        is WorkspacePage.Invitations -> StaffInvitationsScreen(model,rights.teacherInvites,page.batch,page.id,state::back)
        is WorkspacePage.Import -> ImportScreen(model,{state.open(WorkspacePage.Invitations(it))},page.job,state::back)
        is WorkspacePage.Family -> FamilyWorkspace(model,page,state::back,rights,state)
        WorkspacePage.AdminTasks -> AdminTasksScreen(model,{state.open(WorkspacePage.Queue(it))},state::back)
        is WorkspacePage.Queue -> SchoolWorkQueueScreen(model,page.selection,state::openWork,state::back)
    }
    }
}

@Composable
private fun SchoolTabs(model:IdentityViewModel,session:SchoolSession,state:SchoolNavigation,rights:SchoolRights){
    val inboxActive=state.tab==SchoolTab.Messages&&state.communicationSection=="chat"
    SchoolShell(session.actor,state.tab,state::choose,mayManageStudents=rights.students,scrollContent=!inboxActive,
        floatingAction={if(inboxActive)FloatingActionButton(onClick={state.open(WorkspacePage.Directory)}){
            Icon(painterResource(R.drawable.ic_comms_compose),contentDescription=stringResource(R.string.comms_new_message))
        }},notificationAction={
        NotificationAction(model){state.open(WorkspacePage.Notifications())}
    }){tab->
        if(tab!=SchoolTab.Home&&tab!=SchoolTab.Messages&&tab!=SchoolTab.Calendar)Text(stringResource(tab.label),Modifier.semantics{heading()},style=MaterialTheme.typography.headlineMedium)
        when(tab){
            SchoolTab.Home -> SchoolHomeScreen(
                model,session.actor.persona,state.workDate,{state.workDate=it},
                openQueue={state.open(WorkspacePage.Queue(it))},
                openTasks={state.open(WorkspacePage.AdminTasks)},
                openFinance={state.open(WorkspacePage.FinanceReport())},
                openAttendanceReview={state.open(WorkspacePage.AttendanceReview(date=it))},
                openOwnProfile={state.open(WorkspacePage.Profile)},
                openNewsItem={state.open(WorkspacePage.Publication(PublicationSection.News,it))},
                openEventItem={state.open(WorkspacePage.Publication(PublicationSection.Events,it))},
                createEvent={state.open(WorkspacePage.Publication(PublicationSection.Events,create=true))},
                openDirectory={state.open(WorkspacePage.Directory)},openSetup={state.open(WorkspacePage.Calendar)},
                openMore={state.choose(SchoolTab.More)},
                addGuardian={state.open(WorkspacePage.Family(addGuardian=true))},
                openEvents={state.choose(SchoolTab.Calendar)},
                openNews={state.open(WorkspacePage.Publication(PublicationSection.News))},
                openIssue={state.open(WorkspacePage.IssueInvoices())},
                openAnnouncement={state.open(WorkspacePage.Broadcasts())},
                child=state.child,pickChild={state.child=it},
                openProfile={state.child=it;state.tab=SchoolTab.Children},
                openAttendance={classId,date->state.attendanceClass=classId;state.attendanceDate=date;state.tab=SchoolTab.Attendance},
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
                openExams={state.open(WorkspacePage.Exams(it))},openReport={state.open(WorkspacePage.Report(it))},
                openInvoices={state.open(WorkspacePage.Invoices(student=it))},
                openFinance={state.open(WorkspacePage.FinanceReport(it))},
                openStop={state.open(WorkspacePage.Stops(student=it))},
                openNews={state.open(WorkspacePage.Publication(PublicationSection.News))},
                openEvents={state.choose(SchoolTab.Calendar)})
            SchoolTab.Students -> if(rights.students){
                FamiliesScreen(model,openEnrollment={state.open(WorkspacePage.Enrollment(it))},openImport={state.open(WorkspacePage.Import())},openPayer=if(rights.billing)({state.open(WorkspacePage.FeeSettings(it))})else null,openInvoices=if(rights.invoiceViewer)({state.open(WorkspacePage.Invoices(student=it))})else null,openStops=if(rights.stopManager)({state.open(WorkspacePage.Stops(student=it))})else null)
            }
            SchoolTab.Calendar -> SchoolPublicationScreen(model,PublicationSection.Events,null,{state.choose(SchoolTab.Home)},embedded=true)
            SchoolTab.More -> SchoolSettings(model,session,state,rights)
            SchoolTab.Messages -> {
                TabRow(selectedTabIndex=if(state.communicationSection=="feed")1 else 0){
                    for((section,label) in listOf("chat" to R.string.comms_chats,"feed" to R.string.comms_feed)){
                        Tab(selected=state.communicationSection==section,onClick={state.communicationSection=section},text={Text(stringResource(label))})
                    }
                }
                when(state.communicationSection){
                    "feed"->CommunicationFeed(model,session.actor.persona,{state.open(WorkspacePage.Broadcasts())},{state.open(WorkspacePage.Publication(PublicationSection.News,managed=true))},{state.open(WorkspacePage.Publication(PublicationSection.News,create=true))})
                    else->ThreadInbox(model,state.inbox,state::openThread)
                }
            }
        }
    }
}

@Composable
private fun FamilyWorkspace(model:IdentityViewModel,page:WorkspacePage.Family,close:()->Unit,rights:SchoolRights,state:SchoolNavigation){
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        FamiliesScreen(model,initialStudent=page.student,initialGuardian=page.guardian,initialLink=page.link,
            addGuardian=page.addGuardian,openEnrollment={state.open(WorkspacePage.Enrollment(it))},openImport={state.open(WorkspacePage.Import())},openPayer=if(rights.billing)({state.open(WorkspacePage.FeeSettings(it))})else null,openInvoices=if(rights.invoiceViewer)({state.open(WorkspacePage.Invoices(student=it))})else null,openStops=if(rights.stopManager)({state.open(WorkspacePage.Stops(student=it))})else null)
    }
}

@Composable
private fun SchoolSettings(model:IdentityViewModel,session:SchoolSession,state:SchoolNavigation,rights:SchoolRights){
    SettingsGroup(R.string.settings_group_account) {
        OpenPage(state,WorkspacePage.Profile,R.string.profile_title)
        OpenPage(state,WorkspacePage.Security,R.string.security)
        OpenPage(state,WorkspacePage.Account,R.string.app_settings)
        OpenPage(state,WorkspacePage.OfflineAttendance,R.string.drafts_on_device)
        AccountActions(model,session)
    }
    if(rights.persona!=Persona.Admin||rights.school||rights.students||rights.academic||rights.teacherInvites||rights.attendance){
        SettingsGroup(R.string.settings_group_school) {
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
            if(rights.school||rights.students)OpenPage(state,WorkspacePage.Enrollment(),R.string.enrollments)
            if(rights.students||rights.teacherInvites)OpenPage(state,WorkspacePage.Invitations(),R.string.invite_title)
        }
    }
    if(rights.stopManager||rights.persona==Persona.Guardian){
        OpenPage(state,WorkspacePage.Stops(),R.string.stop_title)
    }
    if(rights.invoiceViewer||rights.bank||rights.receiptViewer){
        SettingsGroup(R.string.settings_group_finance) {
            if(rights.receiptViewer||rights.persona==Persona.Guardian)OpenPage(state,WorkspacePage.FinanceReport(),if(rights.persona==Persona.Guardian)R.string.finance_my_payments else R.string.finance_report_title)
            if(rights.invoiceViewer)OpenPage(state,WorkspacePage.Invoices(),R.string.fee_invoices)
            if(rights.receiptViewer)OpenPage(state,WorkspacePage.Receipts(),R.string.receipt_queue)
            if(rights.billing)OpenPage(state,WorkspacePage.FeeSettings(),R.string.fee_settings)
            else if(rights.bank)OpenPage(state,WorkspacePage.Bank,R.string.fee_settings)
        }
    }
    if(rights.access||rights.moderation){
        SettingsGroup(R.string.settings_group_access) {
            if(rights.access)OpenPage(state,WorkspacePage.Access,R.string.staff_access)
            if(rights.moderation)OpenPage(state,WorkspacePage.MessageReports,R.string.chat_reports)
        }
    }
}

@Composable
private fun SettingsGroup(label:Int, content:@Composable () -> Unit) {
    var expanded by rememberSaveable(label) { mutableStateOf(false) }
    val groupState=stringResource(if(expanded) R.string.school_section_expanded else R.string.school_section_collapsed)
    ListItem(headlineContent={Text(stringResource(label),style=MaterialTheme.typography.titleMedium)},
        trailingContent={Text(if(expanded) "−" else "+",Modifier.clearAndSetSemantics {})},
        modifier=Modifier.fillMaxWidth().semantics { stateDescription=groupState }.clickable { expanded=!expanded })
    if(expanded) content()
    HorizontalDivider()
}

@Composable
private fun OpenPage(state:SchoolNavigation,page:WorkspacePage,label:Int){
    ListItem(headlineContent={Text(stringResource(label))}, modifier=Modifier.fillMaxWidth().clickable { state.open(page) })
}
