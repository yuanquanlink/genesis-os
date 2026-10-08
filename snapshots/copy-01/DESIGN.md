# Genesis OS Design Contract

Version: `1.0-chinese-mobile-quality`

Status: permanent product contract. Any agent changing a user-facing Genesis OS interface must read this document first.

## 0. Design source and independent identity

Genesis studies the `awesome-design-md` methodology and selectively learns from several systems:

- Linear: precision, compact operational hierarchy, restrained accent use, and depth through surfaces rather than decoration.
- Notion: calm long-form reading, comfortable whitespace, editorial grouping, and understandable dense information.
- Raycast: a deliberate application feeling, strong dark-mode craft, and clear command-center interactions.
- Vercel: disciplined typography, structural clarity, predictable spacing, and minimal chrome.

Genesis must not copy any product's brand, colors, geometry, layout, or component library. Its own language is **Calm Intelligence（沉静智能）**: private, evidence-aware, precise, humane, and controlled by the owner.

## 1. Product visual philosophy

Genesis is a personal operating system, not a startup landing page or game dashboard. The interface should feel powerful because it answers four questions clearly: what is true, what matters now, what can be acted on, and what still needs owner confirmation.

Visual hierarchy primarily comes from typography, spacing, grouping, whitespace, and subtle surface contrast. Borders, shadows, gradients, badges, and containers are secondary tools and must remain scarce.

## 2. Information hierarchy

Every screen uses four levels:

1. **Primary action or decision**: the one thing the owner should understand or do now.
2. **Active operating state**: current Mission, learning focus, Mastery blocker, deadline, or review request.
3. **Supporting context**: Evidence, progress, rationale, related records, and alternatives.
4. **Technical/audit metadata**: IDs, provenance, source version, provider/model, timestamps, hashes, and receipts.

Level 4 is never deleted. It lives in `details`, expandable audit sections, secondary rows, or dedicated history views so it does not dominate daily use.

## 3. Color roles

Use semantic tokens; never hard-code decorative colors inside feature components.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` | `#f3f5f1` | `#101310` | application canvas |
| `--panel` | `#fbfcf9` | `#171b17` | primary content surface |
| `--panel-2` | `#eef1eb` | `#1e241e` | grouped/selected surface |
| `--panel-3` | `#e6eae3` | `#262d26` | raised interactive surface |
| `--text` | `#19201a` | `#edf1ea` | primary text |
| `--muted` | `#687169` | `#a3aba1` | supporting text |
| `--subtle` | `#879087` | `#7f887d` | audit/meta text |
| `--line` | `#d8ddd5` | `#303830` | necessary dividers |
| `--accent` | `#4f6f46` | `#b7d39d` | one primary action/focus accent |
| `--accent-soft` | `#e6eee0` | `#253120` | selected/supportive accent surface |
| `--danger` | `#a4443d` | `#f09a90` | destructive/error only |
| `--warning` | `#9a652b` | `#dcb06c` | blocked/attention only |
| `--success` | `#3f7149` | `#8bc699` | verified success only |

Provider brands, charts, and module identities must not introduce a rainbow palette. Semantic colors communicate meaning, never decoration.

## 4. Light mode

Light mode is warm-neutral rather than pure white. The canvas and panels have a small contrast step; broad white card walls are forbidden. Use dividers only where reading order is otherwise unclear. Long-form content can remain on the canvas without a card.

## 5. Dark mode

Dark mode is deep charcoal-green, not pure black and not neon. Use a three-step surface ladder. The accent is pale botanical green and remains limited to focus, current selection, verified links, and the primary action. Avoid glowing shadows.

## 6. Typography

The default voice is a system sans. Use weight and size before color to create hierarchy.

- Page title: `clamp(1.55rem, 2vw, 2rem)`, weight 650, line height 1.25.
- Primary focus: `clamp(1.35rem, 2.2vw, 2.15rem)`, weight 620, line height 1.35.
- Section heading: 1.05-1.2rem, weight 620, line height 1.4.
- Body: 0.925-1rem, weight 400, line height 1.7.
- Supporting text: 0.82-0.875rem, line height 1.65.
- Audit metadata: 0.75-0.8rem, line height 1.6; never smaller than 12px.
- Numeric data: tabular numerals where alignment matters.

Serif is optional for a single reflective editorial heading, not a default page-title treatment.

## 7. Chinese typography

Chinese is the product language (`zh-CN`). Do not apply all-caps transforms or exaggerated letter spacing to Chinese. Keep paragraphs around 36-48 Chinese characters per line when practical. Use full-width Chinese punctuation in prose and ensure headings have clear space below. Avoid giant Western marketing headings that create awkward Chinese line breaks.

## 8. Font fallback

Use only safe local/system fonts:

```css
system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei",
"Noto Sans CJK SC", "Source Han Sans SC", sans-serif
```

Technical identifiers and code may use:

```css
ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace
```

Do not download or commit proprietary font files.

## 9. Spacing scale

Use a 4px base: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Default section gap is 24px, compact row gap 8-12px, page gutters 40px desktop / 24px tablet / 16px mobile. Dense operational lists use vertical rhythm, not smaller typography.

## 10. Radius system

- 6px: code, small chips, audit fragments.
- 8px: buttons, inputs, compact controls.
- 12px: panels, sheets, dialogs.
- 16px: only major focus surfaces.
- Pill/full radius: status chips and avatars only; never every button.

## 11. Border system

Default is no border. Use a 1px semantic divider for adjacent controls, tables, audit rows, and necessary surface separation. Avoid nested bordered boxes and double borders. Focus rings are 2px and visually distinct from borders.

## 12. Elevation and shadow system

- Level 0: flat canvas.
- Level 1: surface contrast only.
- Level 2: surface plus one hairline, used for dialogs/sheets.
- Level 3: restrained shadow for floating overlays only.

Cards in ordinary page flow do not need shadows. Never use glow.

## 13. Surface hierarchy

Canvas contains the page. Primary panels group one operational subject. Secondary surfaces group related rows inside a panel. Avoid placing every metric in a separate card. If five equal cards appear, question whether a list, table, timeline, or grouped panel is clearer.

## 14. Accent usage

Accent means current, actionable, or owner-confirmed. One visually dominant accent action per viewport is the default. Do not use accent as a large decorative background. Destructive actions use danger and require explicit labels.

## 15. Icon behavior

Icons support recognition; they never replace an important Chinese label. Use consistent 16-20px line icons. Primary mobile destinations have icon plus text. Avoid decorative icon clouds and icon-only destructive actions.

## 16. Navigation

Navigation groups product capabilities instead of presenting one undifferentiated list:

- 每日运行：今日、使命、战略、月度复盘。
- 学习成长：学习、掌握验证、工程挑战、成长、证据。
- 个人智能：导师、知识库、长期记忆、数字分身、自我输入、时间线。
- 认知与工具：认知成长、使用概览、设置。

Every existing module remains reachable. Grouping is progressive disclosure, not capability removal.

## 17. Sidebar

Desktop sidebar is calm, stable, and scrollable. Brand and privacy boundary stay visible. Use group labels and a restrained active state. Do not show more than one badge per row. At tablet/mobile, the desktop sidebar disappears entirely rather than shrinking into tiny rows.

## 18. Mobile bottom navigation

The fixed primary navigation contains exactly five destinations: **今日、学习、导师、成长、我的**. Touch height is at least 56px plus safe-area inset. “我的” opens a sheet containing every secondary capability, grouped by domain. The sheet must be keyboard accessible, dismissible, and scrollable. No capability is hidden permanently.

## 19. Header

Header contains current page title, concise state/eyebrow, theme control, and at most one primary action. On mobile, title and action may wrap; no metadata pill may crowd the title. Provider mode belongs in secondary detail.

## 20. Buttons

Minimum mobile target is 44x44px. Primary buttons use accent fill; secondary buttons use subtle surface; tertiary actions are text with a clear hover/focus background. Labels are verbs in Chinese: “确认投影”, “提交复盘”, “开始学习”. Disabled controls explain why nearby.

## 21. Inputs

Inputs are at least 44px high on touch screens, use 14-16px Chinese text, persistent labels, useful Chinese placeholders, visible focus, and adjacent validation. Do not use placeholders as labels. Textareas resize vertically and preserve owner-authored text.

## 22. Selects

Select labels and option chrome are Chinese; canonical content values may remain original. Status values must display through the Chinese terminology map without renaming internal enums.

## 23. Dialogs

Dialogs are reserved for focused confirmation or conflict resolution. Title states the consequence; body distinguishes AI suggestion from formal truth; primary and cancel actions are explicit. Restore focus on close.

## 24. Sheets

Mobile secondary navigation and dense audit detail use bottom/side sheets. Sheets keep a visible close button, safe-area padding, and scroll containment. They are not hidden drawers with undiscoverable gestures.

## 25. Cards

Use cards for distinct interactive objects, not for every paragraph. A card has one topic, one heading, and a small number of actions. Prefer flat grouped rows inside major panels. Avoid card-within-card walls.

## 26. Data panels

Data panels begin with the question the data answers, then the value, then its measurement boundary. Missing data displays “暂无数据” rather than zero. Ratios never become personality scores or fabricated evaluation.

## 27. Status chips

Use chips only for state such as “待确认”, “已批准”, “已拒绝”, “已阻塞”, “已验证”. Internal enum values may appear in expandable audit detail. Never use a chip for every noun.

## 28. Tables

Desktop tables use strong column labels and row dividers. At 390/430px, convert dense tables to labeled rows, cards, or expandable details; do not rely on horizontal scrolling for primary tasks. Audit tables may scroll if all columns remain available.

## 29. Timeline

Timeline emphasizes event title, meaning, and date. Evidence/provenance is secondary. Use a single vertical rule; avoid separate boxed cards for every event.

## 30. Empty states

Every empty state explains: what is missing, why it matters, the approval boundary, and one safe next step. Never use fabricated sample data as if real. “暂无已批准战略” is preferable to a blank panel.

## 31. Loading states

Use one concise Chinese status such as “正在读取今日状态…”. Preserve layout to reduce movement. Loading must not imply success or create records on GET.

## 32. Error states

Errors are Chinese, actionable, non-secret, and categorized when possible: local runtime, Provider, database, origin, or network. Provide retry or a safe diagnostic route. Never expose stack traces, keys, private URLs, prompts, or file content.

## 33. Toast and feedback

Feedback describes the persisted effect: “已保存为待确认建议” is better than “成功”. For truth-sensitive actions, mention the remaining owner step. Use polite neutral language; never shame or celebrate unverified achievement.

## 34. Learning UI

Learning shows goal, current stage, Concept Graph, selected materials and trust, estimated learning duration with confidence, today's task, weak concepts, delayed reviews, assessments, project challenge, Mastery Gates, assistance/independence, remediation, Evidence, and next direction. Summary comes first; technical detail expands below.

## 35. Mastery UI

Always distinguish “课程完成” from “真正掌握”. Show all eight Gates with passed/failed/waiting states, evidence, cause, and next action. Do not reduce Mastery to one progress percentage. AI score alone never looks authoritative.

## 36. Review Center UI

Owner control is visually primary. The sequence is AI 待确认建议 -> 查看来源 -> 预览影响 -> Owner 授权 -> 确认投影 -> 回执. Confirm, reject, defer, revision, and source actions are Chinese. Candidate and formal truth never share the same visual label.

## 37. Strategy and Mission UI

Display long-term direction -> Strategy -> Mission -> today's action as one hierarchy. Source links and conflicts remain available. A Mission Candidate cannot look active before confirmation.

## 38. Knowledge UI

Knowledge feels like organized personal intelligence, not database administration. Lead with title, source, trust, relation, and use. IDs, hashes, parser metadata, and provenance live in audit disclosure. AI Knowledge remains untrusted until approval.

## 39. Mentor UI

Mentor is a serious thinking workspace, not a generic chat stream. Structure output as factual context, Evidence, patterns, competing explanations, strategic options, and next action. Every recommendation shows source references, time, and confidence/limitations.

## 40. Daily Operating UI

Today is the strongest page. In order it answers: current state, highest priority, why, next concrete action, expected duration, blockers, and evening reflection. Use one primary focus surface, a plan list, operational signals, and a closing section—not equal card walls.

## 41. Reading UI

Use comfortable measure and line height. Separate source excerpt, summary, owner thought, and AI analysis. Copyright/status boundaries stay visible without dominating reading.

## 42. Business UI

Use a case-study and decision-training structure: situation, assumptions, economics, alternatives, decision, board critique, and transferable principle. Never present individualized securities trading instructions.

## 43. Movie UI

Use reflection and life-stage analysis: character decision, organizational/cultural context, alternative interpretation, misreading risk, and owner question. Avoid inspirational clichés and fictional certainty.

## 44. Responsive behavior

- 1440px: max content width, stable sidebar, generous gutters.
- 1280px: same hierarchy with tighter gutters.
- 768px: one/two-column adaptation, desktop sidebar removed, mobile primary navigation enabled.
- 430px and 390px: one-column primary flow, full-width important actions, readable type, no horizontal overflow, technical details collapsed but reachable.

Use container/grid reflow, not `transform: scale()`.

## 45. Mobile touch-target rules

Primary actions and navigation are at least 44px. Adjacent destructive/confirm actions have enough separation. Inputs use 16px text to avoid mobile zoom. Fixed navigation respects `env(safe-area-inset-bottom)`. Important actions are never tiny icon-only controls.

## 46. Motion

Use 120-200ms transitions for hover, sheet, and disclosure. Honor `prefers-reduced-motion`. Motion confirms spatial relationship; it does not decorate or delay. No parallax, pulsing dashboards, or infinite shimmer.

## 47. Accessibility

Use semantic landmarks, heading order, labeled controls, keyboard access, visible focus, sufficient contrast, `aria-current` for navigation, and meaningful status announcements. Do not convey Candidate/formal or pass/fail distinctions by color alone. Dialogs/sheets require focus management and Escape close.

## 48. Progressive disclosure

Keep all capability detail, but reveal it in this order:

1. meaning and next action;
2. supporting context and limitations;
3. source Evidence and relationships;
4. audit metadata and raw identifiers.

Use `details`, tabs, secondary panels, sheets, and dedicated history. Never delete information to make a screen cleaner.

## 49. Do rules

- Write all product chrome in clear Simplified Chinese.
- Preserve proper nouns, code, source titles, IDs, routes, tables, and enums internally.
- Distinguish fact, owner self-report, and AI inference.
- Show why an action matters and what formal effect it will have.
- Keep one dominant action and a stable reading order.
- Use real empty/error/loading states and owner-controlled recovery.
- Validate 1440, 1280, 768, 430, and 390 in light and dark modes.
- Keep every existing Genesis capability reachable on desktop and mobile.

## 50. Don't rules

- Do not remove, hide permanently, mock, or weaken a capability for aesthetics.
- Do not translate stable TypeScript, API, database, schema, or audit identifiers.
- Do not make AI suggestion look like confirmed truth.
- Do not use giant headings, card walls, excessive pills, borders, shadows, gradients, glow, or rainbow charts.
- Do not expose private content, secrets, prompts, or owner-specific remote hosts.
- Do not claim real-user, real-phone, production, cloud-sync, or Mastery verification from automated tests.
- Do not introduce public network exposure, Funnel, port forwarding, or weaker origin checks.

## Implementation gate

Before merging any UI change:

1. confirm every existing capability remains reachable;
2. run localization and responsive regression tests;
3. inspect at least one desktop and one 390/430 mobile rendering;
4. inspect both light and dark modes for significant visual changes;
5. verify Candidate, approval, Evidence, Context, Ability, Memory, Mission, Strategy, and Mastery boundaries remain unchanged;
6. run the complete repository validation suite.
