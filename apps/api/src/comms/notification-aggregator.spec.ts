import { aggregateForParent } from './notification-aggregator';

describe('aggregateForParent', () => {
  it('sans payeur distinct : une seule cible', () => {
    const r = aggregateForParent('m1', null, 'Titre', 'Corps');
    expect(r.targetMemberIds).toEqual(['m1']);
    expect(r.context).toBe('DIRECT');
  });

  it('avec payeur différent : parent + enfant', () => {
    const r = aggregateForParent('child', 'parent', 'Annulation', 'Cours annulé');
    expect(r.targetMemberIds.sort()).toEqual(['child', 'parent'].sort());
    expect(r.context).toBe('PARENT_AGGREGATED');
  });
});
