// Generated from packages/contracts/openapi.yaml by pnpm generate:contracts.
export const schoolResourceKindValues=["notice","thread","broadcast","child","attendance","exam","evaluation","activity","homework","application","invoice","receipt","fee_stop"] as const;
export type SchoolResourceKind=typeof schoolResourceKindValues[number];

export interface SchoolResourceLink {
  kind: SchoolResourceKind;
  id: string;
  childId?: string;
  date?: string;
}

export const schoolOperations = {
  "resolveSchoolResourceLink": {
    "path": "/resource-links/{kind}/{id}",
    "method": "GET"
  }
} as const;
