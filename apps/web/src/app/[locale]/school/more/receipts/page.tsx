import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import {receiptState,type Locale} from "@madrasty/contracts";
import {Reconciliation} from "@/features/finance/Reconciliation";
import {ReceiptDetails} from "@/features/finance/ReceiptDetails";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function ReceiptsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{receipt?:string;state?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const id=z.uuid().safeParse(query.receipt).data;
  if(session.activePersona==="guardian"&&id)return <ReceiptDetails locale={locale} id={id} staff={false}/>;
  const [read,post]=await Promise.all([mayUse(session,"finance.read"),mayUse(session,"finance.post")]);
  if(!read&&!post)notFound();
  return id?<ReceiptDetails locale={locale} id={id} staff/>:
    <Reconciliation locale={locale} enabled={post} initialState={receiptState.safeParse(query.state).data}/>;
}
