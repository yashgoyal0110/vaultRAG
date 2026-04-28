import type { Bindings } from './types';
import { generateUUID } from './crypto';

export async function logAudit(
  env: Bindings,
  params: {
    tenantId: string;
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateUUID(),
      params.tenantId,
      params.userId || null,
      params.action,
      params.resourceType || null,
      params.resourceId || null,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.ipAddress || null,
      params.userAgent || null,
      Date.now()
    ).run();
  } catch (e) {
    // Never fail the main request because audit logging failed
    console.error('Audit log failed:', e);
  }
}
