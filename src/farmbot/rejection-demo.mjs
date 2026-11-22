// Validator input for the rejection demonstration on /farmbot/ only: this fixed
// string is never a query to be executed and never a model result. The screen
// feeds it through the same closed routing parser that checks model text.
export const REJECTED_ROUTING_DEMO_TEXT = 'MATCH (part:Part) RETURN part';
export const REJECTED_ROUTING_DEMO_ID = 'cypher-output';
