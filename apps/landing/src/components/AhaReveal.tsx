import { useEffect, useRef, useState } from "react";

export interface RevealStep {
  id: string;
  title: string;
  body: string;
}

export const revealSteps: RevealStep[] = [
  {
    id: "endpoints",
    title: "HTTP endpoints",
    body:
      "POST /tickets · GET /tickets/{id} · GET /tickets · PATCH /tickets/{id}/assign — emitted with OpenAPI 3.1.",
  },
  {
    id: "ui",
    title: "Declarative UI",
    body:
      "List view, detail view, and command forms — all from the same blueprint, none hand-coded.",
  },
  {
    id: "state",
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
    <div className="aha">
      <pre className="aha-json" data-testid="blueprint-json"><code>{BLUEPRINT_JSON}</code></pre>
      <div className="aha-panels">
        {revealSteps.map((step, idx) => (
          <RevealPanel key={step.id} step={step} index={idx} />
        ))}
      </div>
    </div>
  );
}

function RevealPanel({ step, index }: { step: RevealStep; index: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
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
    <section
      ref={ref as React.RefObject<HTMLElement>}
      data-testid={`panel-${step.id}`}
      data-visible={visible}
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      <h3>{step.title}</h3>
      <p>{step.body}</p>
    </section>
  );
}
