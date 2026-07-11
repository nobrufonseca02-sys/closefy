import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ImportantLink, SaleRecord } from "./commercial";

const LINKS_KEY = "closefy_links";
const SALES_KEY = "closefy_sales";

export function useStoredLinks() {
  const [links, setLinks] = useState<ImportantLink[]>([]);
  const linksRef = useRef<ImportantLink[]>([]);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) {
      const stored = readCollection<ImportantLink>(LINKS_KEY);
      setLinks((current) => {
        if (dirtyRef.current) return current;
        linksRef.current = stored;
        return stored;
      });
    }
  }, []);

  const updateLinks = useStoredCollectionSetter(LINKS_KEY, setLinks, linksRef, dirtyRef);

  return { links, setLinks: updateLinks };
}

export function useStoredSales() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const salesRef = useRef<SaleRecord[]>([]);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) {
      const stored = readCollection<SaleRecord>(SALES_KEY);
      setSales((current) => {
        if (dirtyRef.current) return current;
        salesRef.current = stored;
        return stored;
      });
    }
  }, []);

  const updateSales = useStoredCollectionSetter(SALES_KEY, setSales, salesRef, dirtyRef);

  return { sales, setSales: updateSales };
}

function useStoredCollectionSetter<T>(
  key: string,
  setState: Dispatch<SetStateAction<T[]>>,
  valueRef: MutableRefObject<T[]>,
  dirtyRef: MutableRefObject<boolean>,
): Dispatch<SetStateAction<T[]>> {
  return useCallback((action: SetStateAction<T[]>) => {
    dirtyRef.current = true;
    const next = typeof action === "function" ? (action as (value: T[]) => T[])(valueRef.current) : action;
    valueRef.current = next;
    writeCollection(key, next);
    setState(next);
  }, [dirtyRef, key, setState, valueRef]);
}

function readCollection<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeCollection<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
