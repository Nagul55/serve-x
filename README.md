# ServeX - Smart Volunteer Coordination and Community Need Dispatch

## The Problem
NGOs often receive urgent community requests through scattered channels (calls, chats, field notes). This causes fragmented records, delayed action, and poor volunteer-to-need matching under pressure.

## Our Solution
ServeX provides an end-to-end workflow: field intake, AI-assisted structuring, urgency ranking, coordinator dashboard operations, dispatch tracking, and notification-driven follow-up in one system.

## Pipeline Diagram
```text
Field Officer / Reporter
          |
          v
   Intake (Web + WhatsApp)
          |
          v
 AI Parsing + Urgency Scoring
          |
          v
 Coordinator Dashboard
          |
          v
 Volunteer Assignment + Dispatch
          |
          v
 Status Updates + Notifications + Resolution
```

## Key Features
- **Unified Intake:** Capture needs from field reports, manual coordinator entries, and Survex WhatsApp survey flow.
- **AI Assistance:** Generate structured need details and urgency scoring from unstructured field text.
- **Coordinator Workbench:** Filter, search, inspect, and manage community needs with clear status lifecycle.
- **Volunteer Dispatch:** Assign volunteers, track dispatch status, and keep the operational context tied to each need.
- **In-App Notifications:** Bell notification center for key operational events, including new survey registration.
- **Secure Access:** Role-based email + password auth with coordinator/field-officer sessions.

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | MongoDB + Mongoose |
| Authentication | JWT + Email/Password |
| WhatsApp Intake | Meta WhatsApp Cloud API + Survex module |
| AI Engine | GeminiAI / NVIDIA DeepSeek integration hooks |
| Maps / Geo | Leaflet + OpenStreetMap |
| Hosting Ready | Vercel/Netlify frontend + Node host backend |

## Project Structure
```text
serve-x/
  backend/
    src/
      config/
      middleware/
      models/
      modules/survex/
      routes/
      services/
      utils/
      server.js
  src/
    api/
    components/
    hooks/
    lib/
    pages/
    utils/
    App.jsx
    main.jsx
  public/
  .env.example
  package.json
```

## Getting Started
1. Install dependencies.
```bash
npm install
```

2. Copy environment template.
```bash
copy .env.example .env
```

3. Fill required values in `.env` (`MONGODB_URI`, JWT secrets, API keys).
```bash
notepad .env
```

4. Start backend.
```bash
npm run backend:start
```

5. Start frontend.
```bash
npm run dev
```

## Environment Variables
```env
VITE_API_BASE_URL=/api
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://127.0.0.1:5173

MONGODB_URI=

JWT_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=
REFRESH_TOKEN_EXPIRES_IN=30d

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=deepseek-ai/deepseek-v4-flash

SURVEX_WHATSAPP_PROVIDER=meta
META_WHATSAPP_BUSINESS_ACCOUNT_ID=
META_WHATSAPP_ACCESS_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_VERIFY_TOKEN=
META_WHATSAPP_DISPLAY_NUMBER=
SURVEX_META_WEBHOOK_URL=
```

## Impact Metrics
| Metric | Before ServeX | With ServeX |
|---|---|---|
| Response time | Multi-day lag | Same-day operational visibility |
| Data entry | Fragmented manual notes | Structured digital pipeline |
| Volunteer matching | Ad-hoc memory based | Dashboard-driven assignment |
| Needs visibility | Scattered communication | Centralized status tracking |
| Operational overhead | High follow-up friction | Reduced coordination load |

## Team
Built with care for social impact operations in Tamil Nadu contexts.

## License
MIT License
