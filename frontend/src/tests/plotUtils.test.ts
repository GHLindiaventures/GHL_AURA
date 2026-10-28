import { describe, it, expect } from 'vitest';
import { comparePlotNumbers } from '../utils/plotUtils';

describe('plotUtils Unit Tests', () => {
  describe('comparePlotNumbers', () => {
    it('sorts numeric plot numbers ascendingly', () => {
      const plots = [
        { plotNumber: '10' },
        { plotNumber: '2' },
        { plotNumber: '1' },
        { plotNumber: '25' },
      ];
      plots.sort(comparePlotNumbers);
      expect(plots.map(p => p.plotNumber)).toEqual(['1', '2', '10', '25']);
    });

    it('handles numeric numbers as number types', () => {
      const plots = [
        { plotNumber: 15 },
        { plotNumber: 3 },
        { plotNumber: 42 },
      ];
      plots.sort(comparePlotNumbers);
      expect(plots.map(p => p.plotNumber)).toEqual([3, 15, 42]);
    });

    it('places numeric plots before alphanumeric plots', () => {
      const plots = [
        { plotNumber: 'B-12' },
        { plotNumber: '5' },
        { plotNumber: 'A-01' },
        { plotNumber: '2' },
      ];
      plots.sort(comparePlotNumbers);
      expect(plots[0].plotNumber).toBe('2');
      expect(plots[1].plotNumber).toBe('5');
    });

    it('sorts alphanumeric plot numbers using natural locale sort', () => {
      const plots = [
        { plotNumber: 'Phase-B' },
        { plotNumber: 'Phase-A' },
      ];
      plots.sort(comparePlotNumbers);
      expect(plots.map(p => p.plotNumber)).toEqual(['Phase-A', 'Phase-B']);
    });

    it('handles null, undefined and missing plotNumber safely', () => {
      const plots = [
        { plotNumber: '4' },
        { plotNumber: undefined },
        { plotNumber: null },
      ];
      expect(() => plots.sort(comparePlotNumbers)).not.toThrow();
    });
  });
});
