// Reference information, opened from the (i) button in the header.

import { html } from "./lib.js";
import { Sheet } from "./ui.js";

// The IMPACT trial's peanut OIT schedule: [day, week, mg of protein] by phase.
const IMPACT = [
  { phase: "Initial escalation", rows: [[0, 0, 0.1], [0, 0, 0.2], [0, 0, 0.4], [0, 0, 0.8], [0, 0, 1.53], [0, 0, 3], [0, 0, 6]] },
  {
    phase: "Build-up",
    rows: [[1, 0, 6], [14, 2, 12], [28, 4, 25], [42, 6, 50], [56, 8, 100], [70, 10, 150], [84, 12, 250], [98, 14, 400],
      [112, 16, 600], [126, 18, 900], [140, 20, 1200], [154, 22, 1600], [168, 24, 2000], [182, 26, 2000], [196, 28, 2000]],
  },
  { phase: "Maintenance", rows: [[210, 30, 2000]] },
  { phase: "Avoidance", rows: [[938, 134, 0]] },
  { phase: "Post-challenge", rows: [[1120, 160, 0]] },
];

const mg = (n) => n.toLocaleString("en-GB");

export const InfoIcon = () => html`
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="9.5" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
  </svg>`;

export function ReferenceSheet({ onClose }) {
  return html`
    <${Sheet} title="IMPACT study schedule" onClose=${onClose}>
      <p class="muted small">Peanut OIT dosing schedule from the IMPACT trial, for reference. Always follow the plan from your clinic.</p>
      <table class="ref-table">
        <thead>
          <tr><th>Day</th><th>Week</th><th>mg protein</th></tr>
        </thead>
        ${IMPACT.map((group) => html`
          <tbody>
            <tr class="ref-phase"><th colspan="3" scope="rowgroup">${group.phase}</th></tr>
            ${group.rows.map(([day, week, dose]) => html`
              <tr><td>${day}</td><td>${week}</td><td class="ref-dose">${mg(dose)}</td></tr>`)}
          </tbody>`)}
      </table>
    <//>`;
}
