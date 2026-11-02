import { useEffect, useState } from "react";

const read = (query, fallback) =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : fallback;

/** Live `matchMedia(query).matches`, with the listener cleaned up on unmount. */
export default function useMediaQuery(query, fallback = false) {
  const [matches, setMatches] = useState(() => read(query, fallback));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(query);
    const apply = () => setMatches(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [query]);

  return matches;
}
