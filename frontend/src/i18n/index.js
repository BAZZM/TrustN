import en from "./en";

const messages = { en };

export function useTranslations(locale) {
  const t = messages[locale] || messages.en;
  return (key) => {
    const parts = key.split(".");
    let v = t;
    for (const p of parts) {
      v = v && v[p];
    }
    return v != null ? v : key;
  };
}

export { en };
