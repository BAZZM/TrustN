import React, { useRef, useState } from "react";
import axios from "axios";

/**
 * "Ask your network": a question box and the ranked people it finds, each with the introduction
 * path. Retrieval and ranking happen on the server (POST /api/connections/ask); this only asks,
 * shows, and reports which result was chosen.
 */
export default function AskNetworkPanel({ baseURL, t, onPick, inputId = "connections-ask-input" }) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [results, setResults] = useState([]);
  const [validation, setValidation] = useState(null);
  const requestCounter = useRef(0);

  const ask = (text) => {
    const trimmed = (text ?? question).trim();
    if (!trimmed) {
      setValidation(t("connections.askRequired"));
      return;
    }
    setValidation(null);
    setStatus("loading");
    const mine = (requestCounter.current += 1);
    axios
      .post(`${baseURL}/api/connections/ask`, { question: trimmed })
      .then((res) => {
        if (mine !== requestCounter.current) return; // a newer question is already in flight
        setResults(res.data?.results || []);
        setStatus("done");
      })
      .catch(() => {
        if (mine !== requestCounter.current) return;
        setResults([]);
        setStatus("error");
      });
  };

  const examples = [t("connections.askExampleOne"), t("connections.askExampleTwo")];

  const pathLine = (r) => {
    const you = t("connections.askPathYou");
    if (r.path?.kind === "via_inner") return `${you} → ${r.path.via?.name || "…"} → ${r.name}`;
    if (r.path?.kind === "direct_inner") return `${you} → ${r.name}`;
    return t("connections.askNoIntroducer");
  };

  return (
    <div className="connections__ask">
      <form
        className="connections__ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <label className="connections__ask-label" htmlFor={inputId}>
          {t("connections.askQuestionLabel")}
        </label>
        <div className="connections__ask-row">
          <input
            id={inputId}
            className="connections__ask-input"
            type="text"
            value={question}
            maxLength={300}
            placeholder={t("connections.askPlaceholder")}
            autoComplete="off"
            onChange={(event) => {
              setQuestion(event.target.value);
              if (validation) setValidation(null);
            }}
          />
          <button type="submit" className="connections__ask-submit">
            {t("connections.askSubmit")}
          </button>
        </div>
        {validation ? (
          <p className="connections__ask-error" role="alert">
            {validation}
          </p>
        ) : null}
      </form>

      {status === "idle" ? (
        <div className="connections__ask-examples">
          <span className="connections__ask-examples-label">{t("connections.askExamplesLabel")}</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              className="connections__ask-example"
              onClick={() => {
                setQuestion(example);
                ask(example);
              }}
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {status === "loading" ? (
        <p className="connections__ask-status" role="status">
          {t("connections.askLoading")}
        </p>
      ) : null}

      {status === "error" ? (
        <div className="connections__ask-error" role="alert">
          <span>{t("connections.askError")}</span>{" "}
          <button type="button" className="connections__ask-example" onClick={() => ask()}>
            {t("connections.retry")}
          </button>
        </div>
      ) : null}

      {status === "done" && results.length === 0 ? (
        <p className="connections__ask-status" role="status">
          {t("connections.askEmpty")}
        </p>
      ) : null}

      {status === "done" && results.length > 0 ? (
        <p className="connections__sr-only" role="status">
          {t("connections.askResultsCount").replace("{count}", String(results.length))}
        </p>
      ) : null}

      {status === "done" && results.length > 0 ? (
        <ul className="connections__ask-results" aria-label={t("connections.askResultsAria")}>
          {results.map((r) => {
            const reachable = r.path?.kind !== "direct_edge_only";
            return (
              <li key={`${r.kind}-${r.id}`}>
                <button
                  type="button"
                  className="connections__ask-result"
                  disabled={!reachable}
                  onClick={() => onPick && onPick(r)}
                >
                  <span className="connections__ask-result-name">{r.name}</span>
                  <span className="connections__ask-result-meta">
                    {[r.job_role, r.industry].filter(Boolean).join(" · ")}
                  </span>
                  <span className="connections__ask-result-path">{pathLine(r)}</span>
                  <span className="connections__ask-result-reason">{r.reason}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
