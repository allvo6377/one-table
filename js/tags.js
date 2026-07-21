// Meal categories for browse/filter. Dietary + numeric tags are derived from
// the recipe's own ingredients and stats (accurate, self-maintaining); a few
// subjective groupings (family / kids / special / dessert) use curated id sets.
// Categories that end up with too few recipes are dropped so we never show an
// almost-empty section.
import { recipes, catOf } from './data.js';

// Ingredients that disqualify a dish from a diet. Eggs are NOT dairy, so a dish
// with eggs still counts as dairy-free (but not vegan).
const DAIRY = new Set(['Greek yogurt', 'Milk', 'Feta', 'Cottage cheese', 'Parmesan', 'Yogurt',
  'Paneer', 'Mozzarella', 'Ricotta', 'Mursik (fermented milk)', 'Pecorino cheese', 'Butter', 'Cream cheese', 'Ghee']);
// Wheat/gluten-bearing items (granola treated as not-GF, to stay on the safe side).
const GLUTEN = new Set(['Sourdough bread', 'White bread', 'Pasta', 'Spaghetti', 'Flour', 'Chapati', 'Roti',
  'Semolina', 'Breadcrumbs', 'Stale bread', 'Puff pastry', 'Croissants', 'Granola']);

const items = r => r.ingredients.map(i => i.item);
const hasMeat = r => items(r).some(i => catOf[i] === 'Protein'); // Protein category = meat/fish only
const hasDairy = r => items(r).some(i => DAIRY.has(i));
const hasGluten = r => items(r).some(i => GLUTEN.has(i));
const has = (r, name) => items(r).includes(name);

const ONE_POT = /stew|curry|soup|pilau|biryani|jollof|khichdi|rajma|githeri|muthokoi|sambar|\bdal\b|katogo|groundnut|wet fry|ndengu|maharagwe|chana|shakshuka|ribollita|minestrone|fagioli|egusi|efo riro|nsala|nazi/i;
const onePot = r => ONE_POT.test(r.name + ' ' + r.tagline);
const mealPrep = r => onePot(r) || /freezer|make-ahead|batch|freezer-friendly|meal-prep/i.test(r.tagline);

// Curated groupings — hand-picked membership the owner can edit in the CMS.
// `members` is mutable so a published override can replace a set; ids that
// don't exist simply never match.
export const CURATED_DEFAULTS = {
  family: ['spaghetti-bolognese', 'chicken-parmigiana', 'jollof-chicken', 'chapati-beef-stew',
    'pilau', 'zanzibar-biryani', 'mukimo-beef', 'kenyan-wet-fry-beef', 'ugandan-groundnut-chicken',
    'pesto-chicken-pasta', 'rajma-rice', 'githeri', 'matoke-groundnut', 'sukuma-ugali', 'beef-posho'],
  kids: ['banana-pancakes', 'banana-bread', 'blueberry-muffins', 'cinnamon-rolls', 'spaghetti-bolognese',
    'pesto-chicken-pasta', 'chapati-beef-stew', 'mahamri-mbaazi', 'kabalagala', 'mango-fruit-bowl',
    'chicken-parmigiana', 'mukimo-beef', 'viazi-karai', 'cheese-danish'],
  special: ['nyama-choma', 'zanzibar-biryani', 'pilau', 'jollof-chicken', 'kuku-wa-kupaka',
    'luwombo-chicken', 'ofada-stew', 'chicken-parmigiana', 'suya-skewers', 'mishkaki-skewers',
    'mukimo-beef', 'chapati-beef-stew'],
  dessert: ['blueberry-muffins', 'cinnamon-rolls', 'cheese-danish', 'almond-croissant', 'banana-bread',
    'mandazi-chai', 'mahamri-mbaazi', 'vitumbua-chai', 'kabalagala', 'pain-au-chocolat', 'cream-scones', 'puff-puff'],
};
const CURATED = Object.keys(CURATED_DEFAULTS);
const members = {};
CURATED.forEach(k => (members[k] = new Set(CURATED_DEFAULTS[k])));

// Each category: id, label, emoji, and a test(recipe) → boolean. `curated`
// categories have editable membership. Cuisines are intentionally absent — the
// app already filters by cuisine everywhere.
const DEFS = [
  { id: 'vegetarian', label: 'Vegetarian', emoji: '🥗', test: r => !hasMeat(r) },
  { id: 'vegan', label: 'Vegan', emoji: '🌱', test: r => !hasMeat(r) && !hasDairy(r) && !has(r, 'Eggs') && !has(r, 'Honey') },
  { id: 'high-protein', label: 'High-protein', emoji: '🍗', test: r => r.protein >= 25 },
  { id: 'budget', label: 'Budget-friendly', emoji: '💰', test: r => r.cost <= 3 },
  { id: 'quick', label: '30-min & quick', emoji: '⚡', test: r => r.timeMin <= 30 },
  { id: 'family', label: 'Family meals', emoji: '👨‍👩‍👧‍👦', curated: true, test: r => members.family.has(r.id) },
  { id: 'kids', label: 'Kids’ meals', emoji: '👶', curated: true, test: r => members.kids.has(r.id) },
  { id: 'gluten-free', label: 'Gluten-free', emoji: '🌾', test: r => !hasGluten(r) },
  { id: 'dairy-free', label: 'Dairy-free', emoji: '🥛', test: r => !hasDairy(r) },
  { id: 'special', label: 'Special occasion', emoji: '🎉', curated: true, test: r => members.special.has(r.id) },
  { id: 'dessert', label: 'Desserts & sweet bakes', emoji: '🍰', curated: true, test: r => members.dessert.has(r.id) },
  { id: 'drinks', label: 'Drinks & smoothies', emoji: '🥤', test: r => /\b(smoothie|juice|lassi|shake)\b/i.test(r.name + ' ' + r.tagline) },
  { id: 'one-pot', label: 'One-pot meals', emoji: '🍲', test: onePot },
  { id: 'meal-prep', label: 'Meal-prep', emoji: '📦', test: mealPrep },
];

const MIN = 3; // hide categories with too few recipes
let overrides = {}; // { labels, emoji, hidden, members } from the CMS

export let CATEGORIES = [];
let BY_ID = {};
function rebuild() {
  const all = Object.values(recipes);
  const hidden = new Set(overrides.hidden || []);
  CATEGORIES = DEFS
    .filter(c => !hidden.has(c.id))
    .map(c => ({
      id: c.id,
      label: (overrides.labels && overrides.labels[c.id]) || c.label,
      emoji: (overrides.emoji && overrides.emoji[c.id]) || c.emoji,
      curated: !!c.curated,
      test: c.test,
      count: all.filter(c.test).length,
    }))
    .filter(c => c.count >= MIN);
  BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
}

// Apply CMS category overrides (labels/emoji/hidden/membership) and rebuild.
export function applyCategoryOverrides(catDoc) {
  overrides = catDoc || {};
  for (const k of CURATED) {
    const ov = overrides.members && overrides.members[k];
    members[k] = new Set(Array.isArray(ov) ? ov : CURATED_DEFAULTS[k]);
  }
  rebuild();
}
rebuild(); // initial build from defaults

// Full category list (including hidden) for the CMS editor.
export function allCategories() {
  return DEFS.map(c => ({
    id: c.id,
    label: (overrides.labels && overrides.labels[c.id]) || c.label,
    emoji: (overrides.emoji && overrides.emoji[c.id]) || c.emoji,
    curated: !!c.curated,
    hidden: (overrides.hidden || []).includes(c.id),
  }));
}

export function matchesCategory(r, id) {
  const c = BY_ID[id];
  return c ? c.test(r) : true;
}

// Dietary themes offered when planning a week: [label, category id]. Only the
// diets that make sense (and have enough recipes) to fill seven days.
export const DIET_OPTIONS = [
  ['Anything', ''],
  ['Vegetarian', 'vegetarian'],
  ['Vegan', 'vegan'],
  ['High-protein', 'high-protein'],
  ['Gluten-free', 'gluten-free'],
  ['Dairy-free', 'dairy-free'],
  ['Budget', 'budget'],
];
export const dietId = label => (DIET_OPTIONS.find(([l]) => l === label) || [, ''])[1];
