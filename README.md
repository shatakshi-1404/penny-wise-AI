# 🪙 PennyWise AI

**Spend mindfully. Save effortlessly.**

PennyWise AI is a personal expense tracker that rounds every expense up to the next ₹10, ₹50 or ₹100 and tallies the difference as **virtual savings**. It categorizes expenses with a **custom machine-learning model trained in this repo** and uses **Groq's hosted LLM** only for natural-language entry and friendly explanations.

> **Virtual savings only.** PennyWise never moves real money. There is no bank or UPI integration.

This is V1 of a student portfolio project.

---

## 1. Features

| Page | What it does |
|---|---|
| **Dashboard** | Monthly budget, total expenses, remaining budget, round-up savings, weekly bar chart, category donut, recent transactions, savings goal progress, one AI insight |
| **Transactions** | Add / edit / delete, search, category filter, rounded amount + savings per row, ML-predicted category with confidence (you can always override it) |
| **Savings Vault** | Total virtual savings, create and delete goals, progress bars |
| **AI Assistant** | Type "I spent 350 rupees at Domino's yesterday", review a preview, confirm; ask questions about your money; get insights; see your model's evaluation numbers |
| **Auth** | Register, log in, log out, protected pages (JWT) |

A **demo account** with ~65 synthetic transactions is available (`demo@pennywise.ai` / `Demo@1234`). It is flagged `is_demo` and the dashboard shows a banner so demo data is never mistaken for real data.

## 2. Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Recharts, Lucide React, Axios, React Router
- **Backend:** Python, FastAPI, SQLAlchemy 2, PostgreSQL, Pydantic v2, JWT (PyJWT), bcrypt
- **AI:** scikit-learn (TF-IDF + Logistic Regression + Pipeline), joblib, Groq API (called with `httpx`)
- **Tests:** Pytest (52 tests)

## 3. AI architecture

```
                    ┌──────────────────────────────────────────┐
 "Paid 300 Uber"──► │ Custom ML model (TF-IDF + LogReg, joblib) │──► category + confidence
                    └──────────────────────────────────────────┘     (offline, no API key)

 "I spent 350 at    ┌────────┐   JSON    ┌──────────┐   ┌─────────────────┐
  Domino's          │  Groq  │ ────────► │ Pydantic │──►│ Preview + ML    │──► user confirms ──► DB
  yesterday"  ────► │  LLM   │           │ validate │   │ second opinion  │
                    └────────┘           └──────────┘   └─────────────────┘

 DB rows ──► Python calculates totals ──► stats (JSON) ──► Groq explains in words
                                                    └────► (or deterministic fallback)
```

**Custom ML vs. LLM, the key difference**

| | Custom classifier | Groq LLM |
|---|---|---|
| Who trained it? | **You**, with `python -m app.train_model` on `expenses.csv` | Groq / Meta (the model name in `GROQ_MODEL`). **You did not train it.** |
| Where does it run? | Locally, inside your backend | On Groq's servers |
| Needs an API key? | No | Yes |
| Used for | Predicting an expense category | Parsing sentences, writing explanations |
| Can invent numbers? | No | It could, so it is never allowed to calculate; it only receives numbers computed in Python |

## 4. Database structure

Four tables (PostgreSQL). All money is stored as **integer paise** (₹1 = 100 paise) to avoid floating-point errors.

- **users**: `id, name, email, hashed_password, created_at` (+ `is_demo` flag)
- **transactions**: `id, user_id, merchant, amount_paise, rounded_amount_paise, savings_paise, category, description, transaction_date, created_at` (+ `predicted_category`, `ml_confidence`, so the UI can show what the model guessed even if you override it)
- **budgets**: `id, user_id, monthly_limit_paise, rounding_increment_paise, month, year` (one row per user per month)
- **savings_goals**: `id, user_id, title, target_amount_paise, saved_amount_paise, created_at`

Every query is filtered by `user_id`. Touching another user's transaction or goal returns **404** (not 403), so IDs can't be probed.

**How goals get filled:** your total round-up savings are poured into goals in the order they were created (oldest first). `saved_amount_paise` is recalculated whenever savings or goals change.

## 5. API endpoints

All except register/login need `Authorization: Bearer <token>`. Interactive docs: http://localhost:8000/docs

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account, returns token |
| POST | `/api/auth/login` | Log in, returns token |
| GET | `/api/auth/me` | Current user |
| GET | `/api/transactions` | List (`q`, `category`, `date_from`, `date_to`, `limit`) |
| POST | `/api/transactions` | Create (category optional → ML decides) |
| PUT | `/api/transactions/{id}` | Edit |
| DELETE | `/api/transactions/{id}` | Delete |
| GET | `/api/dashboard/summary` | Budget, expenses, remaining, savings, goal |
| GET | `/api/dashboard/weekly` | Last 7 days of spending |
| GET | `/api/dashboard/categories` | This month's category breakdown |
| GET / PUT | `/api/budget` | Monthly limit + rounding increment (₹10/50/100) |
| GET | `/api/savings` | Total savings + goals |
| POST | `/api/savings/goals` | Create goal |
| DELETE | `/api/savings/goals/{id}` | Delete goal |
| POST | `/api/ai/extract-transaction` | Sentence → validated preview (nothing saved) |
| POST | `/api/ai/insights` | 3 short insights |
| POST | `/api/ai/chat` | Answer a finance question |
| POST | `/api/ml/predict-category` | Category + confidence from your model |
| GET | `/api/ml/metrics` | Your model's evaluation numbers |
| GET | `/api/health` | Health check |

Amounts are sent in **rupees** (e.g. `"142"` or `"142.50"`) and returned in **paise**.

## 6. Installation (Windows 11, PowerShell)

Prerequisites: Python 3.13, Node.js 22, PostgreSQL. Extract the project to `D:\PennyWise`.

### 6.1 PostgreSQL setup

Create the database (adjust the path to your PostgreSQL version; you'll be asked for the `postgres` password you chose at install):

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE pennywise;"
```

Tables are created automatically when the backend starts.

### 6.2 Backend

```powershell
cd D:\PennyWise\backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1      # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env                       # set DATABASE_URL password and a long random SECRET_KEY
```

Generate a secret key:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

> If your PostgreSQL password contains `@`, `:` or `/`, URL-encode it in `DATABASE_URL` (e.g. `@` → `%40`).

Train the model, load demo data, start the API:

```powershell
python -m app.train_model
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

### 6.3 Frontend

Open a **second** PowerShell window:

```powershell
cd D:\PennyWise\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open http://localhost:5173 and click **Try the demo account**, or register your own.

### 6.4 Groq API setup (optional)

1. Create a free key at https://console.groq.com/keys.
2. Put it in `backend\.env`: `GROQ_API_KEY=gsk_...` (restart uvicorn).
3. `GROQ_MODEL` defaults to `openai/gpt-oss-120b`. If Groq retires a model, pick a current one from their docs.

**Without a key**, everything still works: expense tracking, round-ups, ML categorization, dashboard, and the assistant's built-in deterministic answers. Only "type a sentence" extraction needs Groq, and it shows a friendly message instead of crashing. The key lives only in the backend `.env` and is never sent to the browser.

### 6.5 ML training instructions

```powershell
cd D:\PennyWise\backend
.\.venv\Scripts\Activate.ps1
python -m app.train_model
```

Output: `app\models\category_classifier.joblib` (the model) and `app\models\metrics.json` (evaluation). Edit `app\data\expenses.csv` to add your own labeled examples, then re-run the command. If the model file is missing or was saved by a different scikit-learn version, the backend retrains automatically on startup.

### 6.6 Testing

```powershell
cd D:\PennyWise\backend
python -m pytest -q
```

Tests use an in-memory SQLite database and never touch your PostgreSQL data. They cover round-ups, already-rounded amounts, transaction create/update/delete and validation, user ownership, ML loading/prediction/reproducibility, a missing Groq key, and invalid LLM output.

## 7. Round-up rules

`app/rounding.py` has one function, `calculate_roundup(amount_paise, increment_paise)`: round **up** to the next multiple; if the amount is already a multiple, savings are **0**.

| Amount | Increment | Rounded | Saved |
|---|---|---|---|
| ₹75 | ₹10 | ₹80 | ₹5 |
| ₹142 | ₹10 | ₹150 | ₹8 |
| ₹299 | ₹10 | ₹300 | ₹1 |
| ₹1245 | ₹50 | ₹1250 | ₹5 |
| ₹950 | ₹10 or ₹50 | ₹950 | ₹0 (already a multiple) |

> The original project brief listed "₹950 → ₹960" and "₹950 with ₹50 → ₹1000", but also required "already-rounded amounts save zero". 950 is a multiple of both 10 and 50, so those examples contradict the zero-savings rule. V1 follows the explicit zero-savings rule. To always bump to the *next* multiple instead, change the `remainder == 0` branch in `rounding.py` to return `amount + increment`, and update `tests/test_rounding.py`.

## 8. How it works (beginner-friendly)

**TF-IDF.** Computers can't read words, so we turn each description into numbers. *TF* (term frequency) counts how often a word appears in the text. *IDF* (inverse document frequency) down-weights words that appear in almost every example ("paid", "for") and up-weights rare, telling words ("uber", "pharmacy"). The result is one vector of weights per expense. We also use word pairs (bigrams) like "electricity bill".

**Why Logistic Regression.** It's a fast, simple classifier that works well on sparse text vectors and gives *probabilities* for each category, which we use as the confidence score. It's also easy to explain: each category learns a weight for every word. A neural network would be overkill for ~300 short examples.

**How the model is trained** (`app/train_model.py`):
1. Load `expenses.csv` (300 labeled examples, 30 per category, synthetic and hand-written).
2. Split 80/20 with a fixed seed (42), stratified so every category appears in both sets.
3. Fit a scikit-learn `Pipeline` (`TfidfVectorizer` → `LogisticRegression`) on the 240 training rows only.
4. Predict the 60 held-out rows the model never saw; compute accuracy and macro-F1.
5. Save the model with joblib and the numbers to `metrics.json`.

I picked `C=50` and the word-level vectorizer by 5-fold cross-validation **on the training split only**, so the test set stayed untouched.

**How predictions work.** When you add an expense, the backend feeds `"merchant + description"` to the pipeline, which returns a probability per category. The top one becomes the suggestion; below **40% confidence** it's flagged *uncertain* and the UI tells you to double-check. You can always override the category, and PennyWise remembers both what the model predicted and what you chose.

**Measured result (the actual `metrics.json`):** accuracy **71.7%**, macro-F1 **0.717** on 60 held-out examples. Treat this as a rough guide only: the dataset is small and synthetic, so real-world accuracy will be lower, and 60 test rows means each wrong answer moves accuracy by ~1.7 points.

**How Groq is integrated** (`app/ai_service.py`). The backend sends your sentence and today's date to Groq's chat-completions API, asking for JSON with merchant, amount, category, date, description. The reply is treated as untrusted text.

**Why Pydantic validation.** LLMs sometimes return malformed JSON, negative or zero amounts, made-up categories, or future dates. The reply is parsed into an `ExtractedTransaction` model that rejects bad amounts, drops unknown categories, and clamps future dates. If it fails validation, you get a friendly error and nothing is saved. Then your own classifier gives an independent category; if it disagrees with the LLM, you choose. Finally you review the preview and confirm.

**How financial statistics are calculated** (`app/analytics.py`). SQLAlchemy queries sum the real rows: spent this month, remaining budget, savings, category totals, top merchants. Those numbers go into a small JSON object. For chat and insights, Groq receives that JSON and is instructed to use only those numbers. If Groq is down or the key is missing, `fallback_answer()` builds the reply from the same JSON with plain Python.

## 9. Deployment (not deployed, instructions only)

This project has **not** been deployed or tested in production. A typical free-tier route:

1. **Database:** create a PostgreSQL instance (Neon, Supabase, Render, Railway) and copy its connection string into `DATABASE_URL` (use the `postgresql+psycopg2://` prefix).
2. **Backend** (Render / Railway): root `backend`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set `DATABASE_URL`, `SECRET_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `FRONTEND_URL` (your frontend's exact origin, for CORS). Run `python -m app.train_model` in the build step (or commit the model file).
3. **Frontend** (Vercel / Netlify): root `frontend`, build `npm run build`, output `dist`, env `VITE_API_URL=https://your-backend-url`. Add a rewrite of all paths to `/index.html` so React Router deep links work.
4. Don't run `python -m app.seed` against a production database unless you want the demo account there.

## 10. Limitations (V1)

- Virtual savings only. No bank/UPI/real money movement.
- Single currency (₹); one budget per month; no recurring expenses, receipts or CSV import.
- The classifier is trained on ~300 synthetic examples. It knows common Indian merchants and phrases but will be wrong on unfamiliar ones, and the reported accuracy is optimistic for real data.
- Groq extraction needs internet and an API key; free-tier rate limits apply.
- Tokens last 7 days, are stored in `localStorage`, and there is no password reset or email verification.
- Tables are created with `create_all`; there are no database migrations (Alembic).
- The backend was tested on SQLite (tests) and the UI was built and type-checked, but not exercised against a live PostgreSQL or in a browser by the author of this build. See the delivery notes.

## 11. Future improvements

- Learn from your corrections: retrain on the overrides you make
- Alembic migrations, refresh tokens, password reset
- Recurring expenses, CSV/bank-statement import, multi-currency
- Larger real-world training set, confusion-matrix view, calibrated probabilities
- Per-category budgets and charts for month-over-month trends
- Docker Compose for one-command setup and CI for tests + build

## 12. Project structure

```
PennyWise/
├─ README.md   .gitignore
├─ backend/
│  ├─ app/  main.py config.py database.py models.py schemas.py auth.py rounding.py
│  │        analytics.py ml_service.py ai_service.py routes.py train_model.py seed.py
│  │        data/expenses.csv    models/(category_classifier.joblib, metrics.json)
│  ├─ tests/ conftest.py test_rounding.py test_transactions.py test_ml.py test_ai.py
│  ├─ requirements.txt  .env.example
└─ frontend/
   ├─ src/ App.tsx main.tsx index.css  components/ pages/ services/ context/ lib/
   └─ package.json  tailwind.config.js  vite.config.ts  .env.example
```
