import { useEffect, useRef, useState } from "react";

export interface RevealStep {
  id: string;
  k: string;
  title: string;
  body: string;
}

export const revealSteps: RevealStep[] = [
  {
    id: "endpoints",
    k: "01",
    title: "HTTP endpoints",
    body:
      "POST /tickets · GET /tickets/{id} · GET /tickets · PATCH /tickets/{id}/assign — emitted with OpenAPI 3.1.",
  },
  {
    id: "ui",
    k: "02",
    title: "Declarative UI",
    body:
      "List view, detail view, and command forms — all from the same blueprint, none hand-coded.",
  },
  {
    id: "state",
    k: "03",
    title: "State machine",
    body:
      "Open → Assigned → Resolved · Closed — invariants enforced by the runtime, not by you.",
  },
];

const BLUEPRINT_JSON = `{
  "service": "ticketing",
  "aggregates": {
    "Ticket": {
      "fields": { "title": "string", "description": "string", "assignee": "UserId?" },
      "states": ["Open", "Assigned", "Resolved", "Closed"],
      "commands": {
        "open":   { "from": "*",        "to": "Open" },
        "assign": { "from": "Open",     "to": "Assigned", "params": { "assignee": "UserId" } },
        "resolve":{ "from": "Assigned", "to": "Resolved" },
        "close":  { "from": "Resolved", "to": "Closed" }
      }
    }
  },
  "ui": { "screens": ["List", "Detail", "Assign"] }
}`;

export function AhaReveal() {
  return (
    <div className="aha-grid">
      <figure className="aha-figure">
        <pre
          className="aha-code"
          data-testid="blueprint-json"
          data-filename="blueprint.json"
        >
          <code>{BLUEPRINT_JSON}</code>
        </pre>
        <figcaption className="figcaption">
          <b>Fig. 01</b>One input. Three effects. Keep reading →
        </figcaption>
      </figure>
      <ol className="aha-panels">
        {revealSteps.map((step, idx) => (
          <RevealPanel key={step.id} step={step} index={idx} />
        ))}
      </ol>
    </div>
  );
}

function RevealPanel({ step, index }: { step: RevealStep; index: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setVisible(true);
      return;
    }

    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < viewportH && rect.bottom > 0) {
      setVisible(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.3, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <li
      ref={ref}
      className="aha-panel"
      data-testid={`panel-${step.id}`}
      data-visible={visible}
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      <div className="aha-k">{step.k}</div>
      <div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </div>
    </li>
  );
}
