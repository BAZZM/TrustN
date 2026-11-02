import { useEffect } from "react";

/**
 * Mirrors the user's accessibility preferences onto <html> as `data-large-text` / `data-high-contrast`,
 * which `index.css` uses to scale the root font size and raise contrast tokens app-wide.
 */
export default function usePreferenceAttributes(user) {
  const largeText = !!user?.large_text;
  const highContrast = !!user?.high_contrast;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.largeText = String(largeText);
    root.dataset.highContrast = String(highContrast);
    return () => {
      delete root.dataset.largeText;
      delete root.dataset.highContrast;
    };
  }, [largeText, highContrast]);
}
