---
name: ask-lead
description: Review a whole group of related cases the spec does not decide, ask the Lead (the user) with 2-3 options per question, then write the answers into docs/spec.md and docs/test-scenarios.md. Use when the user asks to check a group of cases and ask them before writing the spec, when the Lead raises a case the spec does not cover, or when spec-reviewer reports points that are not in the spec, or when the user says "rà cả nhóm, hỏi mình kèm lựa chọn rồi ghi spec".
argument-hint: "[topic, Lead feedback or spec-reviewer open points]"
---

# Ask the Lead and record the answers

The rules live in decision X5 of `docs/decisions.md` and in "How to work here" and "Things Claude gets wrong" in `CLAUDE.md`. Follow them as written there; this skill only gives the order of the steps. If a rule here and in `CLAUDE.md` or `docs/decisions.md` ever disagree, those files win.

Topic from the user: $ARGUMENTS

Do not write code in this skill. Code follows only after the answers are in the spec (see "Things Claude gets wrong" in `CLAUDE.md`).

## Steps

1. **Read the sources again.** Read `docs/spec.md` in full (rules, screens, acceptance criteria and every "Resolved by Lead") and `docs/test-scenarios.md`. Do not rely on a copy read earlier in the session. Note the highest `CN-` and `AC` numbers.
2. **Map the whole group, not one case.** Starting from the topic, list every related case the change touches. For anything about money, go through each combination of:
   - order status (Placed, Shop confirmed, Preparing, Delivering, Delivered, Cancelled, Rejected),
   - payment state and open transfer reports,
   - refund state and refund method,
   - the actions that can happen to it (edit up, edit down, add a plate, cancel, shop reject, building declined, day closed, cutoff review, "I have transferred", each shop answer).
   For other areas, use the same idea with the states and actions the spec gives for that area.
   For each case, write down which rule or "Resolved by Lead" already answers it. Keep only the cases with no answer, or with two answers that disagree.
3. **Ask.** Use the question tool, at most 5 questions per round, each with 2 or 3 options (X5). Each question stands on its own: name the screen, the state and a concrete example with real amounts in VND. Each option says what the customer and the shop see. Do not choose for the Lead and do not leave a case out because one answer looks obvious. If the answers open new cases, run another round.
4. **Write the answers into the spec.**
   - Add one `CN-<next>` entry per group at the end of "Concerns raised while writing this spec", in the format of the entries above it: title with the related ids and "missing", "ambiguous" or "contradictory", where the case came from, then one `Resolved by Lead (<case>): "<chosen option>": <its meaning>` line per question. Record the Lead's choice and any words they add in full, translated into English; do not shorten them.
   - Update the business rules, screens and flows the answer changes, with a `[CN-<n>]` reference. If an answer replaces part of an earlier decision, say so in both places.
   - Add acceptance criteria `AC<next>` with concrete values for each new behaviour.
5. **Write the scenarios before the code.** For each new acceptance criterion, add rows to `docs/test-scenarios.md` (steps, expected result) with "How run" set to "Planned". The rows are updated to "Browser", "Test" or "Both" once they are run.
6. **Report** to the user in Vietnamese: the new `CN-` and `AC` ids, one line each, and what code has to change next. Do not commit unless the user asks.
