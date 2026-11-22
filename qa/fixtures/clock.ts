const timeZone="Europe/Berlin";

function schoolDate(now:Date){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone,year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(now).filter((part)=>part.type!=="literal").map((part)=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function shiftDay(day:string,offset:number){
  const date=new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+offset);
  return date.toISOString().slice(0,10);
}
function shiftMonth(month:string,offset:number){
  const [year,value]=month.split("-").map(Number);
  return new Date(Date.UTC(year,value-1+offset,1,12)).toISOString().slice(0,7);
}

export function createSchoolClock(now:Date){
  const day=schoolDate(now);
  const weekday=new Date(`${day}T12:00:00Z`).getUTCDay()||7;
  const month=day.slice(0,7);
  return {
    timeZone,
    startsOn:`${month}-01`,
    endsExclusive:`${shiftMonth(month,2)}-01`,
    day,
    weekday,
    weekOf:shiftDay(day,1-weekday),
    holiday:shiftDay(day,1),
    homeworkDue:shiftDay(day,7),
    month,
    nextMonth:shiftMonth(month,1),
  };
}

export const schoolClock=createSchoolClock(new Date());
