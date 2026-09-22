import { parseTemplateDefinition, type TemplateDefinition } from '@journalcollage/editor-core';

declare const require: (path: string) => unknown;

const parseBundledTemplate = (raw: unknown, label: string): TemplateDefinition => {
  const result = parseTemplateDefinition(raw);
  if (!result.ok) throw new Error(`Invalid bundled template ${label}: ${result.issues.map((issue) => issue.path).join(', ')}`);
  return result.template;
};

/** P1-T05's app-bundled catalog. Recipe and Studio data never reach this list. */
export const localTemplateCatalog: readonly TemplateDefinition[] = [
  parseBundledTemplate(require('../../../generated/template-recipes/romantic-deco.template.json'), 'romantic-deco'),
  parseBundledTemplate(require('../../../generated/template-recipes/romantic-deco-two-photo.template.json'), 'romantic-deco-two-photo'),
  parseBundledTemplate(require('../../../generated/template-recipes/play-pop.template.json'), 'play-pop'),
];
