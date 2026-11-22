"use client";

import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {z} from "zod";
import { useEffect,useState,type FormEvent } from "react";
import {
  curriculumOffering,homeworkEntry,homeworkGradeBulkInput,homeworkGradeBulkReceipt,homeworkGradeCorrection,homeworkGradeInput,
  homeworkGradeReceipt,homeworkGradeRow,homeworkGradingItem,homeworkScore,
  type HomeworkEntry,type HomeworkGradeRow,type Locale,
} from "@madrasty/contracts";
import { ApiResponseError } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary,localizedError } from "@/i18n";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";
import { AcademicPageItems,offeringText,useAcademicPage } from "./shared";
import {readGradebookContext,writeGradebookContext,type GradebookContext} from "./gradebook-context";

const copy={
  ar:{title:"تصحيح الواجبات",class:"الفصل",all:"كل فصولي",roster:"كشف التصحيح",details:"تفاصيل الواجب",back:"رجوع للتصحيح",
    score:"الدرجة من ٢٠",pending:"الدرجة غير مسجلة",graded:"طلاب لهم درجة",bulk:"حفظ الدرجات المحددة",
    feedback:"ملاحظات التصحيح",individual:"تصحيح طالب",reason:"سبب التغيير بعد عرض النتيجة للأسرة",
    save:"حفظ",cancel:"إلغاء",hist���q�^