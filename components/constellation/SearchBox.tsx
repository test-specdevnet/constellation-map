"use client";

import { useState, type FormEvent } from "react";

type SearchBoxProps = {
  onSearch: (query: string) => void;
  busy?: boolean;
  value?: string;
  onQueryChange?: (query: string) => void;
  autoFocus?: boolean;
  submitLabel?: string;
};

export function SearchBox({
  onSearch,
  busy = false,
  value,
  onQueryChange,
  autoFocus = false,
  submitLabel,
}: SearchBoxProps) {
  const [internalQuery, setInternalQuery] = useState("");
  const query = value ?? internalQuery;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(query);
  };

  const handleChange = (next: string) => {
    if (value === undefined) {
      setInternalQuery(next);
    }
    onQueryChange?.(next);
  };

  return (
    <form className="search-box" onSubmit={handleSubmit}>
      <label className="search-field">
        <span className="sr-only">Search apps, owners, or categories</span>
        <input
          type="search"
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="Search app name, owner, runtime, category"
          aria-label="Search apps, owners, or categories"
          autoFocus={autoFocus}
        />
      </label>
      <button type="submit" className="primary-action" disabled={busy}>
        {busy ? "Searching..." : submitLabel ?? "Search"}
      </button>
    </form>
  );
}
