# Genesis AI Orb Assistant

## Status

Genesis AI Orb is an additive global interaction layer. It does not introduce a new AI stack and does not start Phase 4 Step 11.

The Orb runtime is ported from the open-source [`lersent001/orb`](https://github.com/lersent001/orb) project. Genesis preserves the upstream liquid-glass WebGPU/WGSL visual system, parameter presets, uniform layout, canvas renderer, floating presence, and state-driven motion. The only intentional replacement is the AI communication backend.

## Reused Orb runtime

- `public/orb/effect.wgsl` stores the upstream liquid-glass shader source.
- `lib/orb/presets.ts` preserves the upstream Orb parameter model and visual presets.
- `lib/orb/orb-uniforms.ts` preserves the upstream uniform buffer writer.
- `lib/orb/orb-renderer.ts` preserves the WebGPU rendering approach and adapts shader loading for Next.js public assets.
- `components/ai-orb-assistant.tsx` mounts the canvas as the global floating Orb and switches between idle, active, loading, and error visual states.

Genesis does not import the full upstream editor/export UI because the product requirement is the Orb assistant experience inside Genesis OS, not the standalone Orb design editor. The chat panel is a Genesis wrapper around the Orb interaction layer.

## Architecture

```text
AI Orb UI
  -> /api/orb-assistant
  -> OrbAssistantService
  -> GenesisAgentController
  -> controlled tool audit / Action Candidate when needed
  -> ContextEngine approvedOnly packet
  -> AI Router
  -> configured Provider adapter, DeepSeek by default
  -> structured read-only response
```

The Orb never imports a Provider adapter directly. Provider selection, timeout, retry, schema validation, Chinese output contract, and usage logging remain owned by the existing AI Router and Provider layer.

## Controlled Agent mode

The Orb panel now acts as `Genesis Agent 控制台`. Natural-language commands are interpreted by `GenesisAgentController`, then routed through explicit controlled tools:

- `get_today_status()`
- `get_daily_plan()`
- `create_task_candidate()`
- `review_candidate()`
- `summarize_context()`
- `generate_learning_plan()`

Each tool has a typed permission scope, Zod-validated input/output contract, and a persisted row in `agent_tool_audit_logs`.

State-changing commands do not execute directly. They create `agent_action_candidates` with:

- original command;
- interpreted intent;
- target module;
- expected change;
- risk level;
- required permission;
- plan JSON;
- `status='pending'`;
- `context_eligible=0`;
- `formal_mutation_allowed=0`.

Database triggers prevent any Agent Action Candidate from becoming Context-eligible or formal-mutation-capable. Direct `projected` / `executed` status changes require owner authorization and projection receipt fields.

## Context boundary

The Orb may read only:

- eligible Approved Context projections for the Mentor purpose;
- sanitized active Daily Operation state such as active Mission title, approved Daily Plan title and completion counts, active learning goal title, missing inputs, and source references;
- evidence references already present in the approved Context packet.

The Orb must not read or surface:

- pending, rejected, stale, revoked, expired, or superseded Candidates;
- raw Reflection text;
- private source file contents;
- untrusted user message content as fact.

## Mutation boundary

The Orb can answer questions, summarize approved context, explain Genesis state, and help the owner decide which existing page or workflow to use next.

The Orb cannot create or modify Goal, Mission, Daily Plan, Memory, Evidence, Ability, Mastery, Strategy, Profile, Growth, or Digital Twin truth. Any state-changing suggestion creates only an Agent Action Candidate and must still enter the existing Owner Confirmation -> Projection -> Execution workflow before it can affect formal state.

## UI contract

- Chinese-first interface.
- Global floating bottom-right assistant.
- Visual runtime matches the upstream Orb liquid-glass canvas rather than a custom assistant icon.
- Dark and light mode via Genesis semantic tokens.
- Responsive 390px and 430px support.
- Mobile placement stays above the fixed five-item navigation.
- States: idle, active, loading/thinking, and error.
