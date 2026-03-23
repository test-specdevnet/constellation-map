"use client";

import { useState, type FormEvent } from "react";

type SearchBoxProps = {
  onSearch: (query: string) => void;
  busy?: boolean;
};

export function SearchBox({ onSearch, busy = false }: SearchBoxProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(query);
  };

  return (
    <form className="search-box" onSubmit={handleSubmit}>
      <label className="search-field">
        <span className="sr-only">Search apps, owners, or categories</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search app name, owner, runtime, category"
          aria-label="Search apps, owners, or categories"
        />
      </label>
      <button type="submit" className="primary-action" disabled={busy}>
        {busy ? "Searching..." : "Search"}
      </button>
    </form>
  );
}
