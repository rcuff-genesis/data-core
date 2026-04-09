# Data Core AI SOP

## Purpose

This SOP explains how to use the Data Core AI assistant inside this codebase.

The assistant is designed to:

- query the mapped local database, not live production apps during chat
- answer questions about Zoho and Walnut data that have already been synced
- ask clarifying questions when a request is vague
- accept feedback and learned instructions through slash commands

## High-Level Data Flow

The assistant works in this order:

1. Source systems provide data.
2. Sync jobs import that data into the local mapped database.
3. The ontology layer stores entities and relations.
4. The chat assistant answers questions from the mapped database.
5. User feedback and `/teach` commands improve future responses.

Current source systems:

- Zoho
- Walnut

Current Walnut focus:

- parts
- inventory
- builds
- Walnut to Zoho sales-order linking

## Important Rule

Do not think of chat as querying Walnut or Zoho directly.

During chat, the assistant should use the mapped local database. Source systems are used during sync or import. This keeps answers stable, fast, and explainable.

## Main User Workflows

### 1. Import data

Use the connector drawer in the UI.

For Zoho:

- use the sync controls in the connector drawer

For Walnut:

- use `Import Walnut`

Walnut import reads from Walnut Postgres and writes mapped records into the app database.

### 2. Ask business questions

Examples:

- `show walnut inventory health`
- `how many active builds in walnut`
- `list low stock walnut parts`
- `forecast parts for active walnut builds`
- `how well do walnut builds line up with zoho sales orders`
- `list sales orders this month`
- `show recent sync status`

### 3. Teach the assistant

Use slash commands directly in chat.

Examples:

- `/teach when I ask about builds, prefer Walnut before Zoho`
- `/teach if a Walnut build has an order number, compare it to Zoho sales orders`
- `/teach ask me one short clarifying question when ranking is unclear`

These learned rules are stored in the database and injected into future system prompts.

If the database stays intact, the rule stays active until someone disables it with `/forget <id>`.

### 4. Rate an answer

Use:

- `/good`
- `/good that comparison format was helpful`
- `/bad`
- `/bad you should have checked Walnut builds before answering`

This stores feedback for later review and improvement.

### 5. Request a missing capability

Use:

- `/tool add monthly forecast by part`
- `/tool add a way to compare walnut inventory against zoho demand`

This does not instantly create the tool. It logs the need so the team can implement it cleanly.

## Supported Slash Commands

### `/help`

Shows available learning commands.

### `/teach <instruction>`

Adds a learned instruction for future chats.

Use this for:

- business-specific preferences
- source priority rules
- formatting preferences
- workflow rules

Do not use this for:

- facts that belong in source data
- large reference documents
- changing actual synced data

### `/good [note]`

Stores positive feedback for the last assistant answer.

### `/bad [note]`

Stores negative feedback for the last assistant answer.

Always include a reason when possible.

Good:

- `/bad you should compare order number across Walnut and Zoho`

Weak:

- `/bad`

### `/tool <request>`

Logs a missing tool or missing capability.

### `/learned`

Lists currently active learned rules.

### `/forget <id>`

Disables one learned rule by ID.

Example:

- `/forget 4`

## What Gets Stored

The learning system stores two kinds of records:

### Learned rules

Stored in:

- [ai_learning_rules](C:/Users/Ryan%20cuff/Desktop/ryans-pc/data-core/sql/002_chat_learning.sql#L1)

Used for:

- persistent workspace instructions
- organization-specific behavior preferences

### Feedback events

Stored in:

- [ai_feedback_events](C:/Users/Ryan%20cuff/Desktop/ryans-pc/data-core/sql/002_chat_learning.sql#L13)

Used for:

- positive feedback
- negative feedback
- tool requests
- teaching history

## Does Learning Persist?

Yes, learned rules are persistent.

They are stored in the app database, not only in memory, so they continue across restarts and future chats.

They will keep working unless one of these happens:

- someone disables the rule with `/forget <id>`
- the database is reset, replaced, or restored from an older backup
- the rule is intentionally removed in code or data cleanup

So the practical answer is:

- yes, it lasts long-term
- no, it is not magical or irreversible

## The Improvement Loop

Use this loop whenever the AI misses something or could answer better.

### Step 1. Ask the question

Example:

`how many active builds in walnut`

### Step 2. Judge the result

If the answer is good:

- use `/good`

If the answer is bad:

- use `/bad <reason>`

Example:

`/bad you should count Walnut builds in active statuses instead of saying the data is missing`

### Step 3. Decide what kind of fix is needed

Use `/teach` when the problem is behavior.

Examples:

- source priority
- what a term means in your business
- how to interpret a workflow
- how to ask clarifying questions

Example:

`/teach when I ask for active Walnut builds, treat active as statuses Pending, Assembly, Testing, and Ready To Pack unless I say otherwise`

Use `/tool` when the problem is missing product capability.

Examples:

- missing SQL logic
- missing ontology relation
- missing command
- missing API route
- missing chart or report

Example:

`/tool add a dedicated active Walnut builds count tool`

### Step 4. Ask again

After teaching or logging the issue, ask the original question again.

Example:

`how many active builds in walnut`

### Step 5. Promote repeated misses into real product work

If users keep needing `/teach` for the same kind of question, the team should convert that into one of these:

- better tool logic
- better ontology mapping
- better relation logic
- better default prompt instructions
- better UI actions or feedback controls

## Quick Rule Of Thumb

Use:

- `/good` when the answer was right
- `/bad` when the answer was wrong
- `/teach` when future behavior should change
- `/tool` when the product needs a new capability
- `/learned` to inspect saved rules
- `/forget <id>` to remove an outdated rule

## Key Behavior Rules

### Clarification first when needed

If the request is vague, the assistant should ask one short clarifying question before guessing.

Examples:

- unclear ranking requests like `top accounts`
- unsupported time ranges
- vague references like `show me those`

### Tool-backed answers only

If the answer depends on data, the assistant should call a tool first.

It should not invent counts, names, shortages, or forecasts.

### "I don't have that data" is acceptable

If the required data is not in the mapped DB or available tools, the assistant should say so clearly.

At that point the user can:

- `/teach` a behavior preference
- `/bad` the answer with a reason
- `/tool` request a missing capability

## Current Walnut-Related Capabilities

The assistant can currently help with:

- Walnut parts lookup
- Walnut inventory listing
- Walnut inventory health summary
- active Walnut build counts
- low-stock parts
- active-build part forecasting
- per-build required parts
- Walnut build lookup
- Walnut to Zoho sales-order alignment summary
- Zoho sales-order views that show linked Walnut builds
- account views that show linked Walnut builds through Zoho sales orders

## Good Usage Examples

### Good question

`forecast parts for active walnut builds`

Why it works:

- clear source
- clear task
- supported by existing tools

### Good teaching instruction

`/teach if a user asks about shortages, check walnut inventory before giving a summary`

Why it works:

- specific
- reusable
- behavioral, not raw data

### Good bad-feedback note

`/bad you answered from zoho only, but this should compare walnut builds against zoho sales orders`

Why it works:

- identifies what was wrong
- suggests the missing behavior

## Poor Usage Examples

### Weak teaching instruction

`/teach be smarter`

Why it is weak:

- too vague
- not actionable

### Wrong use of `/teach`

`/teach order 123 shipped yesterday`

Why it is wrong:

- that is source data, not behavior
- it belongs in synced systems, not learned rules

## How the Team Should Use This

Recommended team workflow:

1. Sync Zoho and Walnut.
2. Ask questions against the mapped DB.
3. If the answer is good, use `/good`.
4. If the answer is wrong, use `/bad <reason>`.
5. If the behavior should change permanently, use `/teach <instruction>`.
6. If a tool is missing, use `/tool <request>`.
7. Periodically review `/learned` and remove outdated rules with `/forget <id>`.

## Admin / Developer Notes

Learning is implemented in:

- [chatService.ts](C:/Users/Ryan%20cuff/Desktop/ryans-pc/data-core/src/ai/chatService.ts#L50)
- [learningStore.ts](C:/Users/Ryan%20cuff/Desktop/ryans-pc/data-core/src/ai/learningStore.ts#L1)
- [route.ts](C:/Users/Ryan%20cuff/Desktop/ryans-pc/data-core/app/api/chat/route.ts#L1)
- [ChatWorkspace.tsx](C:/Users/Ryan%20cuff/Desktop/ryans-pc/data-core/app/ChatWorkspace.tsx#L122)

Important implementation detail:

- this is app-layer learning, not model retraining
- learned rules affect future prompts
- feedback events are stored for review and future product improvements

## Recommended Next Improvements

Recommended next upgrades:

1. Add thumbs up and thumbs down buttons in the chat UI.
2. Add an admin screen for reviewing feedback and tool requests.
3. Add approval states for learned rules.
4. Add analytics to show the most common `/bad` and `/tool` patterns.
5. Add auto-suggestions when the assistant says `I don't have that data`.
