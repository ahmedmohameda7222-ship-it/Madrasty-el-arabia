import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="qa-artifacts/visual-polish/route-survey-matched";
const browser=process.env.VISUAL_POLISH_SURVEY_BROWSER;
if(!["chromium","webkit"].includes(browser))throw Error("Missing browser identity");
const read=(stage,role,locale)=>{
  const folder=join(root,stage,browser,role+"-"+locale);
  const a=JSON.parse(readFileSync(join(folder,"survey.json"),"utf8"));
  if(a.stage!==stage||a.role!==role||a.locale!==locale||a.sha!==(stage==="baseline"?process.env.BASELINE_SHA:process.env.GITHUB_SHA))throw Error("Unmatched capture identity");
  if(!a.rows.length||new Set(a.rows.map(x=>x.route)).size!==a.rows.length)throw Error("Empty or duplicate survey");
  for(const row of a.rows){
    const key=row.route.replace(/[^a-z0-9-]+/gi,"-").replace(/^-|-$/g,"");
    for(const scale of ["normal","text-200"]){
      const path=join(folder,key+"-"+scale+".png");
      if(!existsSync(path)||!readFileSync(path).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error("Missing or invalid matched screenshot");
    }
  }
  return a;
};
const pairs=[],mismatches=[],approvedMenuChanges=[];
for(const role of ["admin","teacher","guardian"])for(const locale of ["de","ar"]){
  const before=read("baseline",role,locale), after=read("candidate",role,locale);
  if(before.fixtureId!==after.fixtureId||before.width!==after.width)throw Error("Unmatched fixture or width");
  const map=new Map(before.rows.map(r=>[r.route,r]));
  if(before.rows.length!==after.rows.length)throw Error("Unmatched advertised route count "+role+" "+locale);
  for(const b of after.rows){
    const a=map.get(b.route);if(!a)throw Error("Unmatched advertised route "+b.route);
    const teacherReview=role==="teacher"&&b.route==="/school/more/attendance";
    const accessParity=a.destination===b.destination&&a.status===b.status&&a.denied===b.denied;
    const approvedMenuChange=teacherReview&&a.advertised===true&&b.advertised===false&&a.denied&&b.denied;
    const parity=accessParity&&(teacherReview?approvedMenuChange:a.advertised===b.advertised);
    if(approvedMenuChange&&accessParity)approvedMenuChanges.push({role,locale,route:b.route,baselineAdvertised:true,candidateAdvertised:false,directAccessDenied:true});
    if(!parity)mismatches.push({role,locale,route:b.route,before:{destination:a.destination,status:a.status,denied:a.denied,advertised:a.advertised},after:{destination:b.destination,status:b.status,denied:b.denied,advertised:b.advertised}});
    pairs.push({role,locale,route:b.route,before:{normal:a.normal.overflow,large:a.large.overflow,denied:a.denied},after:{normal:b.normal.overflow,large:b.large.overflow,denied:b.denied},parity});
  }
}
const overflow=(p,stage)=>p[stage].normal>1||p[stage].large>1;
const result={browser,baselineSha:process.env.BASELINE_SHA,candidateSha:process.env.GITHUB_SHA,matched:pairs.length,
  beforeOverflow:pairs.filter(p=>overflow(p,"before")).length,afterOverflow:pairs.filter(p=>overflow(p,"after")).length,
  fixedOverflow:pairs.filter(p=>overflow(p,"before")&&!overflow(p,"after")).length,
  introducedOverflow:pairs.filter(p=>!overflow(p,"before")&&overflow(p,"after")).length,
  existingDenied:pairs.filter(p=>p.before.denied&&p.after.denied).map(({role,locale,route})=>({role,locale,route})),
  mismatches,approvedMenuChanges,pairs,scope:"Initial advertised routes and one protected direct-route probe only; not full matched scene/element/state matrix or independent visual acceptance."};
writeFileSync(join(root,"matched-"+browser+".json"),JSON.stringify(result,null,2));
console.log("Matched route survey",JSON.stringify({...result,pairs:undefined}));
if(mismatches.length||result.introducedOverflow)process.exitCode=1;
