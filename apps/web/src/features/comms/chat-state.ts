import type { ChatMessage } from "@madrasty/contracts";

type Reaction=ChatMessage["reactions"][number];

/** Project the current actor's one reaction without changing other participants' counts. */
export function projectReaction(current:readonly Reaction[],choice:Reaction["emoji"]|null):Reaction[]{
  const next=current.map(entry=>({...entry,count:entry.count-(entry.mine?1:0),mine:false})).filter(entry=>entry.count>0);
  if(choice){
    const found=next.find(entry=>entry.emoji===choice);
    if(found){found.count++;found.mine=true;}
    else next.push({emoji:choice,count:1,mine:true});
  }
  return next;
}
