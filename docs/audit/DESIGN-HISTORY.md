# Design-/UI-Historie (read-only Recherche, 2026-11-26)

## Treffer
| Suche | Fundort | Dateien (Auszug) | Letzter Commit des Branches | In origin/main? |
|---|---|---|---|---|
| `#C98A4B` | nur `wip/pre-t3.2-snapshot` (lokal) | `src/components/studio/composer/composer-styles.ts` (Vorschau-Verlaeufe) | 67e1233, 2026-08-28, "wip: preserve local work before T3.2" (Einfuehrung = derselbe Commit) | nein |
| "Sudbuch" (Design-System) | ~20 `wip/t*-qa`, `agent/final-redesign-t9-t11`, `redesign/final-handoff`, `qa/t-onb2-*`, `autopilot/remaining-*`, `wip/auth-*` | `src/styles/studio-tokens.css`, `studio-screens.css`, `components/ui/dashboard-studio-shell.tsx` | z. B. wip/t9-qa e316dd9 2026-08-28; agent/final-redesign-t9-t11 14d98f9 2026-08-28; redesign/final-handoff ist in main gemergt | teils (redesign/final-handoff, agent/final-redesign-t9-t11, qa/t-onb2 ja; wip/* nein) |
| "Sudbuch" in main | `src/styles/studio-tokens.css:1325` | nur ein Kommentar "Studio - Sudbuch, Teil 2" | main b4e69ce 2026-10-08 | ja |
| IBM Plex | main und alle Branches | `globals.css`, `auth-card.module.css`, `sign-in.module.css` | - | ja |
| radius 0 als Systemregel | nicht belegt; main nutzt 7-10 px (`studio-tokens.css:264,313,344`) | - | - | - |
| UI fuer Modi (Ultra Realistic / Studio / Kampagne / Freistellen) | `wip/pre-t3.2-snapshot` (12 Dateien), `wip/t*-qa` (6), `agent/final-redesign-t9-t11` | `inhalte-erstellen/components/ModeProductIsolate.tsx`, `ModeProductStudio.tsx`, `src/components/ui/content-type-flows.tsx` | s. oben | nein |

Eingefuehrt: `ModeProductIsolate.tsx` 2026-06-07 in 2688d25 ("Studio-Dashboard, Admin, Billing ..."). Entfernt: 2026-09-15 in 2a383de ("feat: prepare BrewAI for production launch", loescht ModeProductIsolate, ModeProductStudio, content-type-flows). Der Sudbuch-Token-Satz kam 2026-08-28 mit 8276bf1 (T1) und b10d548 (T3); der `#C98A4B`-Treffer ist nur im WIP-Snapshot 67e1233.
Aktuelle Modi-UI auf main/HEAD: `src/components/ui/inhalte-erstellen-studio.tsx` (eine Studio-Maske, kein Modus-Umschalter mehr); `components/` unter inhalte-erstellen existiert in main nicht mehr.

## Fazit
Das Sudbuch-System (Token-CSS, Shell) existierte ab 2026-08-28 auf den redesign-/wip-Branches; in main ist davon nur der Kommentar bei `studio-tokens.css:1325` geblieben, die Farbe #C98A4B und Radius 0 sind dort nicht vorhanden. Die getrennten Modi-Komponenten (Isolate/Studio) wurden am 2026-09-15 bewusst in 2a383de entfernt und durch das einheitliche Studio ersetzt. Wer das alte Design/die alte Modus-UI zurueckhaben will, findet sie in `wip/pre-t3.2-snapshot` (67e1233) und `wip/t9-qa` (e316dd9). Unsicher: "radius 0" habe ich nur per Grep auf `radius: 0` geprueft (kein Treffer in wip/t9-qa/src/styles), nicht visuell.

## Worktrees
| Pfad | Branch | Stand | Bewertung |
|---|---|---|---|
| `.claude/worktrees/agent-a27229f92219fefc4` | feature/label-fidelity | 8dd109b 2026-11-25 "Raise label fidelity ..."; `git log origin/main..branch` leer, Branch in origin/main gemergt (PR #37); 1 uncommittete Aenderung: Snapshot `prompt-builders.test.ts.snap` | verwaist (Agent-Rest), Ursache der roten Tests ist vermutlich der veraltete Snapshot; nicht mehr noetig |
| `E:/.../app.BrewAi.de-ailabel` | feature/campaign-realism | nicht in main gemergt | NICHT verwaist, vorher pruefen |
| `E:/GitHub/brewai-auth-identity-wip`, `brewai-autopilot-remaining`, `brewai-t-onb2-isolated` | wip/auth..., autopilot/..., qa/t-onb2... | als "prunable" markiert (Ordner fehlt) | `git worktree prune` genuegt |

Vorschlag (nicht ausgefuehrt): Snapshot-Aenderung ggf. vorher sichern, dann
`git worktree remove .claude/worktrees/agent-a27229f92219fefc4` (mit `--force` wegen der Aenderung), danach `git worktree prune`. Alternativ vitest per `exclude: [".claude/**"]` in der Config ausschliessen.
