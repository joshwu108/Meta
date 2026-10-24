# AI fixtures

One file per `PromptId` (see `../prompts/index.ts`), named `<promptId>.json`. Returned verbatim
when `MOCK_AI=1`. For `generateStructured` the file holds the JSON object the Zod schema expects.
For `chat` it holds either a string or `{ "reply": "..." }`.
