"use client";

import Link from "next/link";
import {useSearchParams} from "next/navigation";
import { useEffect, useState } from "react";
import {
  approvedAttendanceEntry, attendanceCancellationSchema, attendanceCorrectionSchema, attendanceRevisionHistory, attendanceStatus,
  childSummarySchema, familyAttendanceHistory, staffAttendanceQuery,
  type ApprovedAttendanceEntry, type AttendanceRevisionHistory, type AttendanceStatus, type Locale,
} from "@madrasty/contracts";
import { ApiResponseError,requestApi } from "@/api/client";
import { StartConversation } from "@/features/comms/StartConversation";
import { useAdminCommand } from "@/api/commands";
import { dictionary,localizedError } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { TimetableRead,useTimetableRead } from "@/features/school/timetable/shared";
import {readAttendanceHistoryFilters,writeAttendanceHistoryFilters} from "./history-context";

const copy={
  ar:{title:"تاريخ الحضور",from:"من تاريخ",to:"إلى تاريخ",filter:"عرض السجل",status:"حالة الحضور",all:"كل الحالات",child:"الطفل",
    present:"حاضر",late:"متأخر",absent_unexcused:"غائب بدون عذر",absent_excused:"غائب بعذر",cancelled:"يوم دراسي ملغى",
    preliminary:"أعذار استلمتها المدرسة وفي انتظار الاعتماد",seeExcuse:"عرض إيصال العذر",empty:���q�^