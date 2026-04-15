import { atlasSnapshots, defaultSnapshot, metricDescriptors } from './atlasMarketData';
import { test, expect } from '@jest/globals';

test('atlas snapshots expose multiple market states', () => {
	expect(atlasSnapshots.length).toBeGreaterThan(1);
	expect(defaultSnapshot.countries.length).toBeGreaterThan(3);
	expect(metricDescriptors.length).toBeGreaterThan(3);
});
