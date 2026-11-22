export type GradebookContext={classId:string;workId:string};

export function readGradebookContext(params:Pick<URLSearchParams,"get">):GradebookContext {
  return {classId:params.get("class")??"",workId:params.get("work")??""};
}

export function writeGradebookContext(params:URLSearchParams,patch:Partial<GradebookContext>):URLSearchParams {
  const next=new URLSearchParams(params);
  if(patch.classId!==undefined){
    if(patch.classId)next.set("class",patch.classId);
    else next.delete("class");
  }
  if(patch.workId!==undefined){
    if(patch.workId)next.set("work",patch.workId);
    else next.delete("work");
  }
  return next;
}
