"use client";

import { useState } from "react";
import { type Locale } from "@madrasty/contracts";
import { DirectStaffForm } from "./DirectStaffForm";

/** A staff-invite grant is narrower than a school/academic management grant. */
export function StaffProvisionOnly({locale}:{locale:Locale}) {
  const [revision,setRevision]=useState(0);
  const [created,setCreated]=useState(false);
  return <div className="calendar-layout family-single-panel">
    <div>
      <h1>{locale==="ar"?"إضافة مدرس":"Lehrkraft hinzufügen"}</h1>
      {created&&<p role="status">{locale==="ar"?"تم إنشاء حساب المدرس.":"Das Lehrkraft-Konto wurde erstellt."}</p>}
      <DirectStaffForm key={revision} locale={locale} role="teacher" canCreateAdmin={false} canAssignClasses={false}
        saved={()=>{setCreated(true);setRevision(value=>value+1);}}
        cancel={()=>{setCreated(false);setRevision(value=>value+1);}}/>
    </div>
  </div>;
}
