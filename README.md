# Smart TaskFlow — AI-Powered Productivity System

Smart TaskFlow is an intelligent task management and productivity optimization web application built with React, TypeScript, Vite, Tailwind CSS, and shadcn/ui. It delivers dynamic task prioritization, smart scheduling, time blocking, and actionable analytics.

**Author**: Ved Patel

---

## Key Features

- **AI Task Prioritization**: Real-time multi-factor scoring based on urgency, deadline proximity, duration, and task impact.
- **Interactive Daily Planner**: Smart daily time blocking, schedule generation, and drag-and-drop task organization.
- **Analytics & Productivity Insights**: Visual breakdown of completion trends, category distribution, and streak monitoring.
- **Instant Demo Mode**: Pre-loaded mock workspace with instant local storage persistence (`localStorage`), enabling zero-latency exploration and rapid evaluation.
- **Flexible Backend Architecture**: Seamless dual-provider design supporting both zero-setup local Demo Mode and full cloud Supabase synchronization.

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Lucide Icons, Radix UI primitives, shadcn/ui
- **State & Query**: TanStack React Query v5
- **Animations & Interaction**: Tailwind Animate, Vaul, Embla Carousel
- **Charts**: Recharts

---

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or bun

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd smart-flow-ai-planner

# Install dependencies
npm install

# Start the local development server
npm run dev
```

The application will be accessible at `http://localhost:8080`.

---

## Modes of Operation

### 1. Instant Demo Mode (Default)
Out of the box, Smart TaskFlow boots immediately in **Demo Mode**. You can create, edit, prioritize, complete, and delete tasks, with all changes safely persisted to browser `localStorage`. No cloud database setup is required to evaluate all application features.

### 2. Supabase Cloud Mode (Optional)
To connect your own Supabase instance:
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Set your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
3. Run the migrations in `supabase/migrations/` to prepare your database schema.
4. Restart the development server. The app automatically detects reachable Supabase credentials and activates cloud sync.

---

## Available Scripts

- `npm run dev` — Starts the Vite development server with instant HMR.
- `npm run build` — Builds the optimized production bundle.
- `npm run preview` — Serves the production build locally.
- `npm run lint` — Runs ESLint code quality checks.

---

## License

Developed by Ved Patel.
