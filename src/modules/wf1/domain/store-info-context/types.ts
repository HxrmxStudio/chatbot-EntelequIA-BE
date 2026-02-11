export type StoreInfoQueryType =
  | 'location'
  | 'hours'
  | 'parking'
  | 'transport'
  | 'general';

export interface StoreInfoTemplates {
  locationContext: string;
  hoursContext: string;
  parkingContext: string;
  transportContext: string;
  generalContext: string;
  instructions: string;
}

export interface StoreInfoAiContext {
  contextText: string;
  infoRequested: StoreInfoQueryType;
}
