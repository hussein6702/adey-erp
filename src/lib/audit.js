// Adey ERP – Audit Trail Helper
import { supabase } from './supabase';

/**
 * Log an action to the audit trail
 * @param {string} action - e.g. 'grn_created', 'material_requested'
 * @param {string} entityType - e.g. 'grn', 'production_sheet', 'movement'
 * @param {string} entityId - UUID of the entity
 * @param {string} description - Human-readable description
 * @param {object} metadata - Additional JSON data (old/new values, etc.)
 * @param {string} performedBy - UUID of the user (optional)
 */
export async function logAudit({ action, entityType, entityId, description, metadata = null, performedBy = null }) {
  try {
    await supabase.from('audit_trail').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      metadata,
      performed_by: performedBy,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

/**
 * Fetch audit history for an entity
 */
export async function getAuditHistory(entityType, entityId) {
  const { data, error } = await supabase
    .from('audit_trail')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Failed to fetch audit history:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch recent audit actions across all entities
 */
export async function getRecentActivity(limit = 20) {
  const { data, error } = await supabase
    .from('audit_trail')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) return [];
  return data || [];
}
