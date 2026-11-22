"use client";

import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useState,type FormEvent} from "react";
import {billingMonth,financeReportQuery,financeReportStatus,financeReportSummary,financeStatementEntry,type FinanceReportQuery,type FinanceStatementEntry,type Locale} from "@madrasty/contracts";
import {webHeaders} from "@/api/client-headers";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {ConfirmedAt} from "@/ui/RecordValues";
import {billingCopy,financeAmount} from "./invoice-ui";
import {receiptCopy} from "./receipt-ui";
import {readFinanceReportContext,writeFinanceReportContext} from "./report-context";

const copy={
  ar:{
    title:"كشف الحساب",period:"شهر إصدار الرسوم",asOf:"الأرصدة في تاريخ",from:"السداد المستلم من",through:"السداد المستلم حتى",
    apply:"عرض التقرير",classes:"الفصل في فترة الفاتورة",allClasses:"كل الفصول",allPupils:"كل الطلبة في الكشف",
    filteredPupil:"كشف الطالب المحدد",allStates:"كل الحالات",overdue:"متأخر",billed:"الرسوم الصادرة",collectible:"الرسوم المستحقة للتحصيل",
    applied:"المخصص على الفواتير",outstanding:"إجمالي المتبٶ��q�^