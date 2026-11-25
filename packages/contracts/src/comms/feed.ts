import {z} from "zod";
import {localeSchema,pageQuerySchema} from "../http";
export const communicationFeedKind=z.enum(["announcement","news"]);
export const communicationFeedQuery=pageQuerySchema.extend({locale:localeSchema.default("ar"),filter:z.enum(["all","announcement","news"]).default("all")});
export const communicationFeedEntry=z.object({id:z.uuid(),kind:communicationFeedKind,title:z.string(),body:z.string(),publishedAt:z.iso.datetime(),canManage:z.boolean()});
