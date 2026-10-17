# 0010 Deliberation reorders only exactly tied winners

Date: 16 October 2026. Status: accepted.

## Context

Deliberation let the panel move any category winner up or down Rank 1–5 with a logged reason, even when the scores were not tied. The participant criteria say the panel decides the order only when category winners have exactly the same unrounded average. A reorder against the scores, unannounced, is the easiest result for a team to protest.

## Decision

Winners keep the order of their unrounded average. The panel can swap two neighbouring winners only when their averages are exactly equal, still with a logged reason. The tablet disables the other moves, and the API refuses a saved order that puts a lower average above a higher one.

## Consequences

The published rule and the app agree, so the result follows from the scores. If the panel wants a different order for a non-tied reason, it has to change the rule publicly before the event, not in the room.
