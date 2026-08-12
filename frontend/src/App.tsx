import {useState} from "react";

import {CustomerPanel} from "./features/customer/CustomerPanel";
import {GatePanel} from "./features/gate/GatePanel";
import {OrganizerPanel} from "./features/organizer/OrganizerPanel";
import {registerUser} from "./lib/api";
import type {AuthSession, UserRole} from "./lib/types";

type Mode = "organizer" | "customer" | "gate";

const demoUsers: Record<UserRole, string> = {
  ORGANIZER: "organizer@example.com",
  CUSTOMER: "customer@example.com",
  GATE_OPERATOR: "gate@example.com",
};

function roleForMode(mode: Mode): UserRole {
  if (mode === "organizer") return "ORGANIZER";
  if (mode === "customer") return "CUSTOMER";
  return "GATE_OPERATOR";
}

export function App() {
  const [mode, setMode] = useState<Mode>("organizer");
  const [sessions, setSessions] = useState<Partial<Record<UserRole, AuthSession>>>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const currentRole = roleForMode(mode);
  const currentSession = sessions[currentRole] ?? null;

  async function enterDemo() {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const session = await registerUser(currentRole, demoUsers[currentRole]);
      setSessions((current) => ({...current, [currentRole]: session}));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Erro ao iniciar acesso de teste.");
    } finally {
      setAuthLoading(false);
    }
  }

  let panel = <DemoLogin loading={authLoading} error={authError} role={currentRole} onEnter={enterDemo} />;

  if (currentSession && mode === "organizer") panel = <OrganizerPanel session={currentSession} />;
  if (currentSession && mode === "customer") panel = <CustomerPanel session={currentSession} />;
  if (currentSession && mode === "gate") panel = <GatePanel session={currentSession} />;

  return (
    <>
      <div className="top-nav-zone">
        <header className="top-nav" aria-label="Navegação principal">
          <div className="top-brand">
            <p className="brand-kicker">Cinema e ingressos</p>
            <h1>TicketFlow</h1>
          </div>

          <nav className="mode-switcher">
            <button className={mode === "organizer" ? "active" : ""} onClick={() => setMode("organizer")} type="button">
              Organizador
            </button>
            <button className={mode === "customer" ? "active" : ""} onClick={() => setMode("customer")} type="button">
              Cliente
            </button>
            <button className={mode === "gate" ? "active" : ""} onClick={() => setMode("gate")} type="button">
              Portaria
            </button>
          </nav>

          <div className="rail-status">
            <span className="status-dot" />
            <span>{currentSession ? currentSession.email : "Escolha um perfil para testar"}</span>
          </div>
        </header>
      </div>

      <main className="app-shell">
        <section className="workspace">{panel}</section>
      </main>
    </>
  );
}

function DemoLogin({
  loading,
  error,
  role,
  onEnter,
}: {
  loading: boolean;
  error: string | null;
  role: UserRole;
  onEnter: () => void;
}) {
  return (
    <div className="demo-login">
      <div>
        <p className="section-label">Acesso demo</p>
        <h2>Escolha um perfil</h2>
        <p className="demo-copy">
          Use um perfil de teste para acessar cada fluxo da aplicação.
        </p>
      </div>

      {error ? <StateBlock title="Entrada não concluída" text={error} tone="danger" /> : null}

      <div className="demo-actions">
        <button className="wide-action" disabled={loading} onClick={onEnter} type="button">
          {loading ? "Entrando..." : `Entrar como ${roleLabel(role)}`}
        </button>
      </div>
    </div>
  );
}

function roleLabel(role: UserRole) {
  if (role === "ORGANIZER") return "organizador";
  if (role === "CUSTOMER") return "cliente";
  return "portaria";
}

function StateBlock({title, text, tone = "neutral"}: {title: string; text: string; tone?: "neutral" | "danger"}) {
  return (
    <div className={`state-block ${tone}`}>
      <p className="section-label">{title}</p>
      <p>{text}</p>
    </div>
  );
}
