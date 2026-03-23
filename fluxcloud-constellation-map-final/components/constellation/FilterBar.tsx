"use client";

import type { ChangeEvent } from "react";
import type { FilterMetadata } from "../../lib/types/star";

export type FilterState = {
  runtimeFamily: string;
  projectCategory: string;
  resourceTier: string;
  status: string;
};

type FilterBarProps = {
  filters: FilterMetadata;
  value: FilterState;
  onChange: (next: FilterState) => void;
};

const update =
  (key: keyof FilterState, value: FilterState, onChange: (next: FilterState) => void) =>
  (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...value,
      [key]: event.target.value,
    });
  };

export function FilterBar({ filters, value, onChange }: FilterBarProps) {
  return (
    <div className="filter-bar" aria-label="Constellation filters">
      <label>
        <span>Runtime</span>
        <select value={value.runtimeFamily} onChange={update("runtimeFamily", value, onChange)}>
          <option value="all">All runtimes</option>
          {filters.runtimeFamilies.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value} ({item.count})
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Category</span>
        <select value={value.projectCategory} onChange={update("projectCategory", value, onChange)}>
          <option value="all">All categories</option>
          {filters.projectCategories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value} ({item.count})
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Resource tier</span>
        <select value={value.resourceTier} onChange={update("resourceTier", value, onChange)}>
          <option value="all">All tiers</option>
          {filters.resourceTiers.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value} ({item.count})
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Status</span>
        <select value={value.status} onChange={update("status", value, onChange)}>
          <option value="all">All statuses</option>
          {filters.statuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value} ({item.count})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
