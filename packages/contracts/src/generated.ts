// Generated from packages/contracts/openapi.yaml by pnpm generate:contracts.
export const schoolResourceKindValues=["notice","thread","broadcast","child","attendance","exam","evaluation","activity","homework","invoice","receipt","fee_stop"] as const;
export type SchoolResourceKind=typeof schoolResourceKindValues[number];

export interface SchoolResourceLink {
  kind: SchoolResourceKind;
  id: string;
  childId?: string;
  date?: string;
}

export interface AndroidClientVersions {
  minimumVersionCode: number;
  suggestedVersionCode: number;
  suggestedVersionName: string;
  downloadUrl: string;
  sha256: string;
}

export const schoolOperations = {
  "resolveSchoolResourceLink": {
    "path": "/resource-links/{kind}/{id}",
    "method": "GET"
  },
  "getClientVersions": {
    "path": "/client-versions",
    "method": "GET"
  }
} as const;
