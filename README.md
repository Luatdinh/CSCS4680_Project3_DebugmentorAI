# DebugMentor AI

**CS4680 Prompt Engineering — AI Assistant Project**  
*A learning-focused code debugging tutor built with React, Node.js/Express, and the Ollama Cloud API.*

> **Core idea:** A beginner shouldn't need to blindly copy AI-generated code to fix a bug. DebugMentor offers progressive hints, root-cause explanations, and minimally corrected code, with a dedicated experiment showing how prompt engineering affects the response.

## Features

- Paste code in **Python, JavaScript, or Java**; choose beginner, intermediate, or advanced explanations.
- **Run code** inside Docker to capture actual stdout, compiler errors, and runtime errors before consulting the AI.
- Add an **optional error message** manually, or let the runner auto-fill it.
- Select **Hint first**, **Explain**, or **Show fix**.
- **Iteratively refine** the same bug report: request more hints, a deeper explanation, or the full correction. Previous Q&A summaries are carried into the next AI request.
- **Prompt Lab**: run a basic prompt and the engineered tutor prompt on identical code, then compare their results side by side.
- Responsive dark-themed UI, sample bugs, clear result cards, copyable code, error states, and input validation.
- **Offline examples** work without an API key, but they are honestly labeled **prewritten, non-AI sample outputs**. The real LLM runs only when a valid API key is configured.
- Executes single-file code only in a constrained local Docker container. Does **not** require a database. **Never expose the code runner publicly.**

## 1. Requirements

- Node.js **20+** and npm.
- **Docker Desktop running locally** for the optional Run Code feature (the AI tutor works without Docker). Read `docs/RUN_CODE_SETUP.md`.
- An Ollama Cloud API key with billing/model access for **live AI requests**. Offline samples don't need a key.

> Ollama Cloud API usage can incur charges and its model responses are not guaranteed to be correct. The model and provider credentials belong only on the server.

## 2. Install & run

From this project folder:

```bash
npm install
cp .env.example .env
```

For **real AI debugging**, edit `.env` and add your own secret API key:

```dotenv
OLLAMA_API_KEY=your_actual_key_here
OLLAMA_MODEL=gemma4:31b
PORT=3001
```

The default model is `gemma4:31b`, as used in Ollama’s cloud API documentation. You can choose another model listed on https://ollama.com/search?c=cloud. Use the exact direct cloud model name; local CLI `:cloud` names are different. Do not include real API keys in Git or screenshots.

Start the full development application:

```bash
npm run dev
```

Open **http://localhost:5173** in your browser. To use **Run code**, first install Docker Desktop, start it, and `docker pull python:3.12-alpine`, `docker pull node:22-alpine`, and `docker pull eclipse-temurin:21-jdk-alpine` once. See `docs/RUN_CODE_SETUP.md`. Vite forwards all `/api` requests to Express on port 3001.

### No API key yet?

Leave `OLLAMA_API_KEY=` empty. The app switches to **Offline examples** mode automatically. Choose a built-in Python, JavaScript, or Java sample from the sidebar. **Important:** Offline sample feedback is hardcoded and is **not evidence of live model integration**. Configure a working key for your assessed live AI demo.

### Production build (single server)

```bash
npm run build
npm start
```

Open **http://localhost:3001**. Express serves `client/dist` and the `/api` routes. To deploy publicly, set an appropriate `PORT`, `OLLAMA_API_KEY`, and optional `OLLAMA_MODEL` on the host; use a hosting provider's environment-secret controls.

## 3. Main workflow

1. Click a sample, or paste your own code and select the correct language.
2. Click **Run code**: see real stdout or the exact error; Docker Desktop is required.
3. Select your level, choose Hint / Explain / Show fix, then click the primary action. The detected error is passed to Ollama.
4. Review the issue location, reasoning, next steps, and takeaway.
5. Click **Another hint**, **Explain more**, **Show the fix**, or ask a custom follow-up. Each new request carries up to six previous rounds.
6. Click **Compare prompts**, or navigate to Prompt Lab, to show two separate LLM requests using different prompt approaches.

## 4. Architecture

```text
React frontend (localhost:5173)
  ├─ code editor + language/skill controls
  ├─ Run code panel (stdout, stderr, error type)
  ├─ result and follow-up panels
  ├─ prompt comparison lab
  └─ clearly marked local sample mode
           │ HTTP JSON requests
           ▼
Express backend (localhost:3001)
  ├─ GET  /api/health
  ├─ POST /api/run → Docker isolated containers (local only)
  ├─ POST /api/analyze
  └─ POST /api/compare
           │ creates controlled instructions
           ▼
Ollama Cloud Chat API (from SERVER only)
           │
           ▼
Structured educational explanation (AI does not itself execute code)
```

The app uses `POST https://ollama.com/api/chat` with `Authorization: Bearer <key>` and native `format: "json"` for the tutoring response. The baseline comparison uses a separate simpler prompt with plain text output. No external model calls happen in offline example mode.

### Important files

| File | Responsibility |
|---|---|
| `client/src/App.jsx` | Main UI, guided modes, follow-ups, and comparison |
| `client/src/styles.css` | Responsive interface styling |
| `client/src/samples.js` | Three **prewritten**, locally stored demo examples |
| `server/src/prompts.js` | Persona, few-shot, and iterative refinement prompts; validation |
| `server/src/ollama.js` | Server-side Ollama Cloud request, timeout, JSON normalization |
| `server/src/app.js` | Express API endpoints, error handling, basic rate-limiting |
| `server/src/runner.js` | Restricted local Docker execution for Python, JavaScript and Java |
| `server/test/` | Unit and route tests |
| `docs/` | Assignment mapping, presentation, prompt analysis, test plan, submission checklist |

## 5. Prompt engineering (course requirement)

**Required pattern 1: Persona** (`TUTOR_PERSONA` in `server/src/prompts.js`). The assistant acts as a patient debugging instructor, adjusts explanations to skill level, and avoids claiming unverified execution.

**Required pattern 2: Iterative Refinement** (`createTutorMessages` and follow-up UI). The browser includes prior learner requests and tutor feedback in the next request. The current request can ask for another hint, deeper explanation, or a full fix.

**Supporting pattern 3: Few-Shot** (`FEW_SHOT` in `server/src/prompts.js`). An example JSON diagnosis teaches the format and expected educational level.

**Live, testable comparison:** The Prompt Lab sends the same source code to a generic baseline prompt and the engineered prompt. Results can vary, so evaluate correctness, specificity, educational value, and adherence to the selected mode; don't claim that an engineered prompt *always* wins.

See `docs/PROMPT_ENGINEERING.md` for exact examples, reasoning, and evaluation instructions.

## 6. API routes

`GET /api/health` returns configuration status only, never the secret key.

`POST /api/analyze` request:

```json
{
  "code": "print(values[3])",
  "language": "python",
  "level": "beginner",
  "mode": "hint",
  "errorMessage": "IndexError: list index out of range",
  "question": "Can I have another clue?",
  "history": [{"request": "Get a hint", "answer": "{...prior tutor JSON...}"}]
}
```

The structured response contains `title`, `summary`, `confidence`, `issues`, `steps`, `fixedCode`, `takeaway`, and `followUp`, plus a `source` label. For Hint and Explain modes, the backend **clears** `fixedCode` even if the model accidentally provides it.

`POST /api/run` accepts `{"code":"print(1)","language":"python"}` and returns status, stdout, stderr, error type and runtime; it is local Docker-only and disabled in production.

`POST /api/compare` accepts the same source and returns `baseline` (string), `tutored` (structured object), and `source`. It uses two API calls in live mode and therefore may cost more than a single analysis.

## 7. Verify

```bash
npm test
npm run build
```

Manual test checklist: see `docs/TEST_PLAN.md`.

### Limitations

- The **model** reads source code and any runner diagnostics, but it does not itself compile or execute snippets. The independent Docker runner supplies real compiler/runtime output. AI accuracy is not guaranteed; verify suggested fixes.
- This is a **single-file local MVP**, not a multi-file debugger, IDE plugin, or formally verified code judge. Execution uses resource-restricted Docker containers, not a fully hardened public sandbox.
- Follow-up context is held **only in browser state** during the session. There is no account or persistence.
- The in-memory rate limit is suitable for classroom development, **not a production-scale public service**. Real public deployment needs stronger auth, rate-limits, CORS policy, usage controls, monitoring, and privacy review.
- User code is sent to the AI provider when live mode is enabled. Never paste API keys, passwords, or private corporate code.
- Due date is **Canvas-specific** and wasn't specified in the supplied assignment PDF.

## 8. Submission

The course PDF requires a **GitHub repository URL** and a **published short demo video (<2 minutes)** submitted through the professor's Google Form: https://forms.gle/nMHp5owwYidszwt58. A working live presentation is important. Public deployment is optional bonus credit.

See `docs/SUBMISSION_CHECKLIST.md` before submitting. **This source ZIP is not a GitHub repository, published video, public deployment, or live API credential. You must complete those outside this artifact.**

## Ollama Cloud connection guide

See [`docs/OLLAMA_SETUP.md`](docs/OLLAMA_SETUP.md) for credential setup, direct `curl` verification, API response details and troubleshooting.


## New: compile/run before AI tutoring

Use **Run code** to see actual program output or errors, then **Get a hint** to receive guidance using those observed diagnostics. Python and JavaScript run; Java compiles and runs `Main.java`. This is a local Docker-only feature, disabled for production use. Learn the setup and safety limitations in [`docs/RUN_CODE_SETUP.md`](docs/RUN_CODE_SETUP.md).

## Ollama response format compatibility

The backend now handles strict JSON, Markdown-fenced JSON, and plain-text LLM responses. When a model returns freeform text, the UI labels it *Plain-text model response* instead of crashing. Structured issue fields and fixed code may be unavailable in that fallback.
