/**
 * @file Goal templates (CAR-347).
 *
 * A small library of predefined savings goals so users can create a goal
 * without typing everything from scratch. Pure data + a builder that maps a
 * template into the goal shape `store.addGoal` expects ({ name, target,
 * targetDate? }). No React, no I/O.
 */

/**
 * @typedef {Object} GoalTemplate
 * @property {string} id               stable template id
 * @property {string} name             goal name (UPPERCASE, matches store convention)
 * @property {number} target           default target amount in primary currency
 * @property {number} suggestedMonthly default monthly auto-funding amount
 * @property {string} blurb            one-line description for the picker
 */

/** @type {GoalTemplate[]} */
export const GOAL_TEMPLATES = [
  { id: 'emergency', name: 'EMERGENCY FUND', target: 10000, suggestedMonthly: 500, blurb: '3-6 months of expenses set aside for the unexpected.' },
  { id: 'vacation', name: 'VACATION', target: 3000, suggestedMonthly: 250, blurb: 'A trip fund — flights, lodging, and spending money.' },
  { id: 'car', name: 'NEW CAR', target: 8000, suggestedMonthly: 400, blurb: 'Down payment or full cash for your next vehicle.' },
  { id: 'home', name: 'HOME DOWN PAYMENT', target: 40000, suggestedMonthly: 1000, blurb: 'Save toward a deposit on a home.' },
  { id: 'holidays', name: 'HOLIDAY GIFTS', target: 1200, suggestedMonthly: 100, blurb: 'Spread holiday spending across the year.' },
  { id: 'rainy', name: 'RAINY DAY', target: 2000, suggestedMonthly: 150, blurb: 'A small buffer for minor surprises.' },
];

/**
 * Look up a template by id.
 * @param {string} id
 * @returns {GoalTemplate|null}
 */
export function getGoalTemplate(id) {
  return GOAL_TEMPLATES.find(tpl => tpl.id === id) || null;
}

/**
 * Build the goal fields for `store.addGoal` from a template, applying optional
 * overrides (e.g. a user-edited target or name).
 *
 * @param {GoalTemplate} template
 * @param {{name?:string, target?:number, targetDate?:string}} [overrides]
 * @returns {{name:string, target:number, targetDate?:string}}
 */
export function goalFromTemplate(template, overrides = {}) {
  if (!template) throw new Error('goalFromTemplate: template is required');
  const name = (overrides.name ?? template.name).trim().toUpperCase();
  const target = Math.max(0, Number(overrides.target ?? template.target) || 0);
  const fields = { name, target };
  if (overrides.targetDate) fields.targetDate = overrides.targetDate;
  return fields;
}
