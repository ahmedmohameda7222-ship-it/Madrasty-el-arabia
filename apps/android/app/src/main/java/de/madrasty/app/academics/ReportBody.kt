package de.madrasty.app.academics

import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.ui.isolate
import java.text.NumberFormat
import java.util.Locale
import org.json.JSONObject

private val kindLabels=mapOf(
    "attendance" to R.string.report_attendance,"teaching" to R.string.report_teaching,"activity" to R.string.academic_activities,
    "homework" to R.string.homework_title,"evaluation" to R.string.evaluation_title,"exam" to R.string.exam_title,
)
private val statusLabels=mapOf(
    "present" to R.string.attendance_present,"late" to R.string.attendance_late,"absent_unexcused" to R.string.attendance_absent_unexcused,
    "absent_excused" to R.string.attendance_absent_excused,"cancelled" to R.string.history_cancelled,"oral" to R.string.exam_oral,
    "written" to R.string.exam_written,
)
private val inclusionLabels=mapOf(
    "approved_day" to R.string.report_approved_day,"cancelled_day" to R.string.report_cancelled_day,"unmarked_day" to R.string.report_unmarked_day,
    "delivered_lesson" to R.string.report_delivered,"missing_score" to R.string.report_missing,"recorded_score" to R.string.report_recorded,
    "published_evaluation" to R.string.evaluation_published,"published_result" to R.string.exam_result,
)
private val scaleLabels=mapOf("participation" to R.string.evaluation_participation,
    "understanding" to R.string.evaluation_understanding,"preparation" to R.string.evaluation_preparation)

@Composable
internal fun ReportBody(value:JSONObject,language:String,child:String?,open:(ReportTarget)->Unit){
    val number=NumberFormat.getNumberInstance(Locale.forLanguageTag(language)).apply{maximumFractionDigits=4}
    val enrollments=value.getJSONArray("enrollments").reportObjects()
    if(enrollments.isNotEmpty())Text(stringResource(R.string.report_enrollments),style=MaterialTheme.typography.titleMedium)
    for(enrollment in enrollments){
        val label=enrollment.getString(if(language=="ar")"classNameAr" else "classNameDe")
        val dates=enrollment.getString("enrolledFrom")+" – "+enrollment.getString("enrolledUntil")
        Text(isolate(enrollment.getString("classCode"))+" · "+isolate(label)+" · "+isolate(dates))
    }
    ReportAttendance(value.getJSONObject("attendance"),number)
    val subjects=value.getJSONArray("subjects").reportObjects().associateBy{it.getString("id")}
    for(group in value.getJSONArray("groups").reportObjects()){
        val name=subjects[group.getString("subjectId")]?.getString(if(language=="ar")"nameAr" else "nameDe")?:continue
        SubjectSummary(name,group,number)
    }
    Text(stringResource(R.string.report_sources),style=MaterialTheme.typography.titleLarge)
    val sources=value.getJSONArray("sources").reportObjects()
    if(sources.isEmpty())Text(stringResource(R.string.empty))
    val courses=enrollments.associateBy{it.getString("enrollmentId")}
    for(source in sources){
        val course=courses[source.getString("enrollmentId")]
        val subject=source.string("subjectId")?.let{subjects[it]}
        ReportSourceRow(source,course,subject,language,number,child,open)
    }
}
@Composable
private fun ReportAttendance(attendance:JSONObject,number:NumberFormat){
    HorizontalDivider()
    Text(stringResource(R.string.report_attendance),style=MaterialTheme.typography.titleLarge)
    Text(stringResource(R.string.report_approved_days)+" · "+isolate(number.format(attendance.getInt("days"))))
    for((status,label) in statusLabels){
        if(attendance.has(status))Text(stringResource(label)+" · "+isolate(number.format(attendance.getInt(status))))
    }
}
@Composable
private fun SubjectSummary(label:String,value:JSONObject,number:NumberFormat){
    HorizontalDivider()
    Text(isolate(label),style=MaterialTheme.typography.titleLarge)
    Text(stringResource(R.string.report_teaching)+" · "+isolate(number.format(value.getInt("teachingCount"))))
    val homework=value.getJSONObject("homework")
    Text(stringResource(R.string.report_assigned)+" · "+isolate(number.format(homework.getInt("assigned"))))
    Text(stringResource(R.string.report_graded)+" · "+isolate(number.format(homework.getInt("scored"))))
    val mean=if(homework.isNull("mean"))stringResource(R.string.report_no_marks) else isolate(number.format(homework.getDouble("mean")))
    Text(stringResource(R.string.report_homework_mean)+" · "+mean)
    SummaryPoints(R.string.academic_activities,value.getJSONObject("activities"),number)
    SummaryPoints(R.string.exam_title,value.getJSONObject("exams"),number)
    Text(stringResource(R.string.evaluation_title),style=MaterialTheme.typography.titleMedium)
    val evaluations=value.getJSONObject("evaluations")
    for((scale,description) in scaleLabels){
        val dimension=evaluations.getJSONObject(scale)
        val content=if(dimension.isNull("average"))stringResource(R.string.report_no_marks) else {
            isolate(number.format(dimension.getDouble("average"))+" / "+number.format(5)+" · "+number.format(dimension.getInt("count")))
        }
        Text(stringResource(description)+" · "+content)
    }
}
@Composable
private fun SummaryPoints(label:Int,total:JSONObject,number:NumberFormat){
    val count=total.getInt("count")
    val text=if(count==0)stringResource(R.string.report_no_marks)else
        isolate(number.format(total.getDouble("earned"))+" / "+number.format(total.getDouble("possible"))+" · "+number.format(count))
    Text(stringResource(label)+" · "+text)
}
@Composable
private fun ReportSourceRow(source:JSONObject,course:JSONObject?,subject:JSONObject?,language:String,number:NumberFormat,
    child:String?,open:(ReportTarget)->Unit,
){
    HorizontalDivider()
    val kind=source.getString("kind")
    val titleKey=if(language=="ar")"titleAr" else "titleDe"
    val fallback=if(language=="ar")"titleDe" else "titleAr"
    val title=source.string(titleKey)?.takeIf(String::isNotBlank)?:source.string(fallback)
    Text(listOfNotNull(stringResource(kindLabels.getValue(kind)),title?.let(::isolate)).joinToString(" · "),
        style=MaterialTheme.typography.titleMedium)
    val date=source.getString("date")
    val label=source.string("periodFrom")?.let{"$it – $date"}?:date
    val name=subject?.getString(if(language=="ar")"nameAr" else "nameDe")
    Text(listOfNotNull(label,course?.getString("classCode"),name).joinToString(" · ",transform=::isolate))
    source.string("status")?.let{statusLabels[it]}?.let{Text(stringResource(it))}
    Text(stringResource(inclusionLabels.getValue(source.getString("inclusionReason"))))
    if(!source.isNull("numerator")&&!source.isNull("maximum")){
        Text(isolate(number.format(source.getDouble("numerator"))+" / "+number.format(source.getDouble("maximum"))))
    }
    for((scale,scaleLabel) in scaleLabels)if(!source.isNull(scale)){
        Text(stringResource(scaleLabel)+" · "+isolate(number.format(source.getInt(scale))+" / "+number.format(5)))
    }
    Text(stringResource(R.string.report_revision)+" · "+isolate(number.format(source.getInt("revision"))))
    source.string("resourceId")?.let{id->
        TextButton(onClick={open(ReportTarget(kind,id,child))}){Text(stringResource(R.string.report_open))}
    }
}
