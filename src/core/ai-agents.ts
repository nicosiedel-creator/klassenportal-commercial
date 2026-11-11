// Rollenspezifische KI-Agenten auf Basis des fail-closed KI-Gateways.
//
// ADDITIV: Ohne konfiguriertes Gateway (kein OPENROUTER_API_KEY) liefern alle Rollen
// nur einen Fehlercode und senden nichts nach aussen. Dieses Modul laedt selbst keine
// Daten aus der Datenbank; die aufrufende Stelle entscheidet bewusst, welcher Text
// uebergeben wird. Damit bleiben personenbezogene Daten aussen vor, solange der
// Aufrufer sie nicht ausdruecklich uebergibt.
import type { Env } from './types.js';
import { type AiCallResult, type AiRole, callRoleModel } from './ai-gateway.js';

export interface AiRoleAgent {
  role: AiRole;
  label: string;
  purpose: string;
  system: string;
  model: string;
}

// Modellwahl pro Rolle aus dem aktuellen OpenRouter-Katalog: leichte, hochfrequente Rollen
// bekommen ein schnelles, guenstiges Modell, reasoning-lastige Rollen ein staerkeres.
// Ein gesetztes OPENROUTER_MODEL ueberschreibt alle Rollen global (Operator-Notbremse).
export const AI_ROLE_AGENTS: Record<AiRole, AiRoleAgent> = {
  lerncoach: {
    role: 'lerncoach',
    label: 'Lerncoach',
    purpose: 'Lernhilfe fuer Teilnehmende: erklaeren, motivieren, naechste Lernschritte vorschlagen. Keine Benotung.',
    system: 'Du bist Lerncoach eines Bildungsanbieters. Erklaere verstaendlich und gib konkrete naechste Lernschritte. Bewerte nicht, vergib keine Noten und triff keine Hochrisiko-Entscheidungen.',
    // Hohes Volumen, einfache Erklaerungen: schnelles, guenstiges Modell.
    model: 'google/gemini-3.1-flash-lite',
  },
  lehrkraft: {
    role: 'lehrkraft',
    label: 'Lehrkraft-Assistenz',
    purpose: 'Unterstuetzung bei Vorbereitung sowie Aufgaben- und Feedback-Entwuerfen.',
    system: 'Du unterstuetzt Lehrkraefte bei Vorbereitung und Feedback-Entwuerfen. Entwirf Vorschlaege, die die Lehrkraft prueft; keine verbindlichen Bewertungen.',
    // Gute Textqualitaet bei vertretbaren Kosten.
    model: 'anthropic/claude-sonnet-5.5',
  },
  verwaltung: {
    role: 'verwaltung',
    label: 'Verwaltungs-Assistenz',
    purpose: 'Formulierungen und Ablauforientierung fuer die Verwaltung.',
    system: 'Du unterstuetzt die Verwaltung mit praezisen Formulierungen und Ablauforientierung. Triff keine rechtsverbindlichen Aussagen und loese keine Zahlungen aus.',
    // Praezise, formelle deutsche Formulierungen.
    model: 'openai/gpt-5.6-sol',
  },
  qm: {
    role: 'qm',
    label: 'Qualitaetsmanagement',
    purpose: 'Strukturierung von Qualitaets- und Pruefprozessen.',
    system: 'Du unterstuetzt das Qualitaetsmanagement. Strukturiere Pruef- und Verbesserungsprozesse sachlich und nachvollziehbar.',
    // Lange Kontexte, strukturierte Prozessdokumente.
    model: 'google/gemini-4-carbon',
  },
  compliance: {
    role: 'compliance',
    label: 'Compliance-Pruefung',
    purpose: 'Unterstuetzende Pruefpfade (z. B. BAMF/AZAV). Keine Rechtsberatung.',
    system: 'Du unterstuetzt die Compliance-Pruefung mit Pruefpfaden und Checklisten. Du bietest keine Rechtsberatung und keine verbindliche Foerderzusage.',
    // Sorgfaeltiges Abwaegen: starkes Modell.
    model: 'anthropic/claude-opus-5.5',
  },
  red_team: {
    role: 'red_team',
    label: 'Red-Team-Pruefung',
    purpose: 'Robustheits- und Sicherheitspruefung eigener Inhalte.',
    system: 'Du bist Red-Team-Pruefer. Suche gezielt nach Schwachstellen, Missverstaendnissen und Fehlannahmen im vorgelegten Inhalt und melde sie knapp.',
    // Adversariales Denken: das staerkste verfuegbare Modell.
    model: 'openai/gpt-5.5',
  },
};

const ROLE_KEYS = Object.keys(AI_ROLE_AGENTS) as AiRole[];

export function isAiRole(value: unknown): value is AiRole {
  return typeof value === 'string' && ROLE_KEYS.includes(value as AiRole);
}

export function listAiRoleAgents(): AiRoleAgent[] {
  return ROLE_KEYS.map((role) => AI_ROLE_AGENTS[role]);
}

export interface AiRoleOptions {
  maxTokens?: number;
  temperature?: number;
}

export async function runAiRole(env: Env, role: AiRole, user: string, options: AiRoleOptions = {}): Promise<AiCallResult> {
  const agent = AI_ROLE_AGENTS[role];
  return callRoleModel(env, {
    role: agent.role,
    system: agent.system,
    user,
    model: agent.model,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });
}
