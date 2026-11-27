/**
 * The ONLY pages this CMS can touch. To add a page, add an entry here (id from the WordPress edit URL).
 * root = the id of the page's outer wrapper element; an uploaded file must contain it, which stops
 * the wrong page's HTML being uploaded into a card.
 */
export const PAGES = [
  { id: 153241, key: 'open-finetuner', name: 'Open Finetuner',  slug: 'open-finetuner', root: 'lyzr-oft' },
  { id: 130050, key: 'sovereign-ai',   name: 'Sovereign AI',    slug: 'sovereign-ai',   root: 'lyzr-sov' },
  { id: 154655, key: 'open-cowork',    name: 'Open Cowork',     slug: 'open-cowork',    root: 'lyzr-oc'  }
];
export function pageById(id) { return PAGES.filter(function (p) { return p.id === Number(id); })[0] || null; }
