import {
  FIRST_RELEASE_TEMPLATE_CAPABILITIES,
  templateCapabilityGate,
  type TemplateCapabilityGateResult,
  type TemplateDefinition,
} from '@journalcollage/editor-core';

/**
 * The release client has one fixed renderer/editor capability set. This is a
 * compatibility check, not an entitlement decision and not remote config.
 */
export const localTemplateCapabilityGate = (template: TemplateDefinition): TemplateCapabilityGateResult =>
  templateCapabilityGate(template, FIRST_RELEASE_TEMPLATE_CAPABILITIES);

export const locallySupportedTemplates = (templates: readonly TemplateDefinition[]): readonly TemplateDefinition[] =>
  templates.filter((template) => localTemplateCapabilityGate(template).supported);
