import React, { act } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import AskNetworkPanel from "./AskNetworkPanel";

jest.mock("axios");

global.IS_REACT_ACT_ENVIRONMENT = true;

const translations = {
  "connections.askPlaceholder": "Ask about your network",
  "connections.askSubmit": "Ask",
  "connections.askQuestionLabel": "Your question",
  "connections.askRequired": "Enter a question first",
  "connections.askLoading": "Looking through your network...",
  "connections.askEmpty": "No one in your network matches that yet.",
  "connections.askError": "Couldn't get an answer.",
  "connections.retry": "Try again",
  "connections.askPathYou": "You",
  "connections.askNoIntroducer": "Direct link, no introducer",
  "connections.askExamplesLabel": "Try asking",
  "connections.askExampleOne": "Who works in healthcare?",
  "connections.askExampleTwo": "Anyone in marketing?",
  "connections.askResultsAria": "Matches",
};
const t = (key) => translations[key] || key;

const result = (over) => ({
  id: 1,
  name: "Frank Foster",
  job_role: "Marketing Director",
  industry: "Marketing",
  kind: "inner",
  score: 7.25,
  matched: ["job_role"],
  path: { kind: "direct_inner", via: null },
  reason: "Matches marketing. In your inner circle.",
  ...over,
});

describe("AskNetworkPanel", () => {
  let container;
  let root;

  const flush = () => act(async () => {});
  const type = (value) =>
    act(() => {
      const input = container.querySelector("input");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const submit = () =>
    act(() => {
      container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

  function mount(props = {}) {
    root = createRoot(container);
    const onPick = jest.fn();
    act(() => {
      root.render(<AskNetworkPanel baseURL="" t={t} onPick={onPick} {...props} />);
    });
    return { onPick };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("starts with an input and example questions, and no results", () => {
    mount();
    expect(container.querySelector("input")).toBeTruthy();
    expect(container.querySelectorAll(".connections__ask-example").length).toBeGreaterThan(0);
    expect(container.querySelector(".connections__ask-results")).toBeNull();
  });

  it("asks for a question instead of sending an empty one", async () => {
    mount();
    type("   ");
    submit();
    await flush();
    expect(axios.post).not.toHaveBeenCalled();
    expect(container.querySelector("[role='alert']").textContent).toBe("Enter a question first");
  });

  it("clears the validation message as soon as the user types", async () => {
    mount();
    submit();
    await flush();
    expect(container.querySelector("[role='alert']")).toBeTruthy();
    type("marketing");
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("posts the question, shows loading, then renders results with the introduction path", async () => {
    let resolve;
    axios.post.mockReturnValue(new Promise((r) => (resolve = r)));
    mount({ baseURL: "http://api" });
    type("Who do I know in marketing?");
    submit();
    expect(axios.post).toHaveBeenCalledWith("http://api/api/connections/ask", {
      question: "Who do I know in marketing?",
    });
    expect(container.textContent).toContain("Looking through your network...");

    resolve({
      data: {
        results: [
          result(),
          result({
            id: 2,
            name: "Kate King",
            job_role: "Content Writer",
            kind: "secondary",
            path: { kind: "via_inner", via: { id: 10, name: "Bob Brown" } },
            reason: "Matches marketing. Introduced through Bob Brown.",
          }),
        ],
      },
    });
    await flush();

    const rows = [...container.querySelectorAll(".connections__ask-result")];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Frank Foster");
    expect(rows[0].textContent).toContain("You → Frank Foster");
    expect(rows[1].textContent).toContain("You → Bob Brown → Kate King");
    expect(rows[1].textContent).toContain("Matches marketing. Introduced through Bob Brown.");
  });

  it("hands the chosen result to onPick", async () => {
    axios.post.mockResolvedValue({ data: { results: [result()] } });
    const { onPick } = mount();
    type("marketing");
    submit();
    await flush();
    act(() => container.querySelector(".connections__ask-result").click());
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ id: 1, name: "Frank Foster" });
  });

  it("shows a direct link with no introducer as information, not an action", async () => {
    axios.post.mockResolvedValue({
      data: {
        results: [result({ id: 3, name: "Edge Pal", kind: "secondary", path: { kind: "direct_edge_only", via: null } })],
      },
    });
    const { onPick } = mount();
    type("painter");
    submit();
    await flush();
    const row = container.querySelector(".connections__ask-result");
    expect(row.disabled).toBe(true);
    expect(row.textContent).toContain("Direct link, no introducer");
    act(() => row.click());
    expect(onPick).not.toHaveBeenCalled();
  });

  it("says so when nothing matches", async () => {
    axios.post.mockResolvedValue({ data: { results: [] } });
    mount();
    type("underwater basket weaving");
    submit();
    await flush();
    expect(container.textContent).toContain("No one in your network matches that yet.");
  });

  it("shows an error with a retry that asks again", async () => {
    axios.post.mockRejectedValueOnce(new Error("boom"));
    mount();
    type("marketing");
    submit();
    await flush();
    expect(container.querySelector("[role='alert']").textContent).toContain("Couldn't get an answer.");

    axios.post.mockResolvedValueOnce({ data: { results: [result()] } });
    const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "Try again");
    act(() => retry.click());
    await flush();
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll(".connections__ask-result")).toHaveLength(1);
  });

  it("ignores a slow earlier answer that arrives after a newer one", async () => {
    let resolveFirst;
    axios.post
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ data: { results: [result({ id: 2, name: "Newer Answer" })] } });
    mount();
    type("first");
    submit();
    type("second");
    submit();
    await flush();
    expect(container.textContent).toContain("Newer Answer");

    resolveFirst({ data: { results: [result({ id: 1, name: "Older Answer" })] } });
    await flush();
    expect(container.textContent).toContain("Newer Answer");
    expect(container.textContent).not.toContain("Older Answer");
  });

  it("an example chip asks that question straight away", async () => {
    axios.post.mockResolvedValue({ data: { results: [] } });
    mount();
    act(() => container.querySelector(".connections__ask-example").click());
    await flush();
    expect(axios.post).toHaveBeenCalledWith("/api/connections/ask", { question: "Who works in healthcare?" });
    expect(container.querySelector("input").value).toBe("Who works in healthcare?");
  });
});
