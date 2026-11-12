"use client";

import { useId, useMemo, useRef, useState, useEffect } from "react";
import { ChevronDown, Globe, Search, X } from "lucide-react";

export interface CountryOption {
  code: string;
  name: string;
}

/**
 * Canonical ISO 3166-1 alpha-2 Country List.
 * Covers international markets and Dailymotion discovery catalog regions.
 */
export const ISO_COUNTRIES: CountryOption[] = [
  { code: "US", name: "United States" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "JP", name: "Japan" },
  { code: "CA", name: "Canada" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "BR", name: "Brazil" },
  { code: "IN", name: "India" },
  { code: "MX", name: "Mexico" },
  { code: "AU", name: "Australia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "EG", name: "Egypt" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "PL", name: "Poland" },
  { code: "TR", name: "Turkey" },
  { code: "AR", name: "Argentina" },
  { code: "CO", name: "Colombia" },
  { code: "CL", name: "Chile" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "ID", name: "Indonesia" },
  { code: "MY", name: "Malaysia" },
  { code: "PH", name: "Philippines" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "AT", name: "Austria" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PT", name: "Portugal" },
  { code: "GR", name: "Greece" },
  { code: "CZ", name: "Czech Republic" },
  { code: "RO", name: "Romania" },
  { code: "HU", name: "Hungary" },
  { code: "UA", name: "Ukraine" },
  { code: "IL", name: "Israel" },
  { code: "MA", name: "Morocco" },
  { code: "DZ", name: "Algeria" },
  { code: "TN", name: "Tunisia" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "PE", name: "Peru" },
];

interface CountrySelectorProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  placeholder?: string;
  mode?: "api" | "local";
  helperText?: string;
  className?: string;
}

export function CountrySelector({
  value,
  onChange,
  label = "Country",
  placeholder = "Select or search country...",
  mode = "local",
  helperText,
  className = "",
}: CountrySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const selectedCountry = useMemo(() => {
    if (!value) return null;
    const upper = value.trim().toUpperCase();
    return ISO_COUNTRIES.find((c) => c.code === upper) ?? { code: upper, name: upper };
  }, [value]);

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ISO_COUNTRIES;
    return ISO_COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [search]);

  // Click-outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  function handleSelect(code: string) {
    onChange(code);
    setOpen(false);
    setSearch("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setSearch("");
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
        >
          {label}
        </label>
        <span
          className={`text-[9px] font-extrabold uppercase tracking-wider ${
            mode === "api"
              ? "text-blue-600 dark:text-blue-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {mode === "api" ? "API Param (ams_country/country)" : "Local Filter"}
        </span>
      </div>

      {/* Trigger Button */}
      <div
        id={id}
        tabIndex={0}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className="flex min-h-10 w-full cursor-pointer items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <div className="flex items-center gap-2 truncate">
          <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
          {selectedCountry ? (
            <span className="truncate">
              <strong>{selectedCountry.code}</strong> — {selectedCountry.name}
            </span>
          ) : (
            <span className="text-[var(--muted-foreground)]">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 pl-2">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear country"
              className="rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
        </div>
      </div>

      {helperText && (
        <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">{helperText}</p>
      )}

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg animate-in fade-in-0 zoom-in-95">
          <div className="border-b border-[var(--border)] p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country or ISO code..."
                className="min-h-8 w-full rounded border border-[var(--border)] bg-[var(--surface-container-low)] pl-8 pr-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <ul className="max-h-48 overflow-y-auto p-1 text-xs" role="listbox">
            {filteredCountries.length === 0 ? (
              <li className="px-3 py-2 text-center text-xs text-[var(--muted-foreground)]">
                No matching countries found.
              </li>
            ) : (
              filteredCountries.map((c) => {
                const isSelected = selectedCountry?.code === c.code;
                return (
                  <li
                    key={c.code}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(c.code)}
                    className={`flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      isSelected
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--foreground)] hover:bg-[var(--surface-container-high)]"
                    }`}
                  >
                    <span>{c.name}</span>
                    <span
                      className={`font-mono text-[11px] font-black uppercase ${
                        isSelected ? "text-white/90" : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {c.code}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
