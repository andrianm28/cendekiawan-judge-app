# 0011 An absent judge leaves the panel

Date: 16 October 2026. Status: accepted (Elite Academy chose it on 16 Oct).

## Context

Every judge scores every team and the final is the average (ADR 0003). If a judge does not come, or leaves mid-event, only 80 of 100 sheets arrive: the result can never be locked and category ties are never offered, because both wait for every judge. The app had no way out.

## Decision

The operator can mark a judge **absent** (and bring them back until the result is locked). An absent judge's sheets stay stored but stop counting: every team's average, the lock check and the tie offer use the judges still on the panel, so all 20 teams are judged by the same panel. The absent judge's tablet says so and its saves are refused. At least two judges stay on the panel. If the absent judge owns a category, the operator records its tie pick.

## Consequences

The event can finish with four judges and stays fair, since no team gets a different panel. Marking a judge absent is logged in the change log. Sheets an absent judge already submitted are not used even for the teams they scored.
