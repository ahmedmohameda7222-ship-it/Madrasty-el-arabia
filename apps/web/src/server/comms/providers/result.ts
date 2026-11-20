export type TransportResult =
  | {state:"accepted";providerId?:string}
  | {state:"retry";failure:"provider_unavailable"|"provider_throttled";after?:number}
  | {state:"failed";failure:"provider_rejected"|"provider_config";invalidInstallation?:boolean;retryable?:boolean}
  | {state:"uncertain";failure:"confirmation_lost"};

export function providerDelay(value:string|null|undefined){
  if(!value)return undefined;
  const seconds=/^\d+$/.test(value)?Number(value):(Date.parse(value)-Date.now())/1000;
  return Number.isFinite(seconds)?Math.min(86400,Math.max(1,Math.ceil(seconds))):undefined;
}
