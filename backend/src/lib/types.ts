export type Bindings = {
  DB: D1Database;
  DOCS: R2Bucket;
  VECTORS: VectorizeIndex;
  CACHE: KVNamespace;
  AI: Ai;
  JWT_SECRET: string;
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
};

export type AuthContext = {
  userId: string;
  tenantId: string;
  email: string;
};

export type Variables = {
  auth: AuthContext;
};
