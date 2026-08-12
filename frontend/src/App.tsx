import {useState} from "react";

import {CustomerPanel} from "./features/customer/CustomerPanel";
import {GatePanel} from "./features/gate/GatePanel";
import {OrganizerPanel} from "./features/organizer/OrganizerPanel";
import {registerUser} from "./lib/api";
import type {AuthSession, UserRole} from "./lib/types";

type Mode = "organizer" | "customer" | "gate";
type View = Mode | "home";

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
  const [view, setView] = useState<View>("home");
  const [sessions, setSessions] = useState<Partial<Record<UserRole, AuthSession>>>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const currentRole = roleForMode(mode);
  const currentSession = view === "home" ? null : (sessions[currentRole] ?? null);

  async function enterDemo(targetMode = mode) {
    const targetRole = roleForMode(targetMode);
    setMode(targetMode);
    setView(targetMode);
    if (sessions[targetRole]) {
      setAuthError(null);
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    try {
      const session = await registerUser(targetRole, demoUsers[targetRole]);
      setSessions((current) => ({...current, [targetRole]: session}));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Erro ao iniciar acesso de teste.");
    } finally {
      setAuthLoading(false);
    }
  }

  let panel = (
    <DemoLogin
      loading={authLoading}
      error={authError}
      mode={mode}
      role={currentRole}
      onEnter={enterDemo}
      onSelectMode={setMode}
    />
  );

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
            <button className={view === "home" ? "active" : ""} onClick={() => setView("home")} type="button">
              Home
            </button>
            <button className={view === "organizer" ? "active" : ""} onClick={() => enterDemo("organizer")} type="button">
              Organizador
            </button>
            <button className={view === "customer" ? "active" : ""} onClick={() => enterDemo("customer")} type="button">
              Cliente
            </button>
            <button className={view === "gate" ? "active" : ""} onClick={() => enterDemo("gate")} type="button">
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
  mode,
  role,
  onEnter,
  onSelectMode,
}: {
  loading: boolean;
  error: string | null;
  mode: Mode;
  role: UserRole;
  onEnter: (mode: Mode) => void;
  onSelectMode: (mode: Mode) => void;
}) {
  return (
    <div className="demo-login">
      <section className="intro-panel">
        <p className="section-label">Sobre o projeto</p>
        <h2>Bilheteria online para sessões de cinema</h2>
        <p className="demo-copy">
          O TicketFlow simula uma plataforma de ingressos para filmes e séries. O organizador cria sessões usando
          dados do TVMaze, o cliente compra um ingresso com pagamento simulado e a portaria valida o QR Code na entrada.
        </p>
        <p className="demo-copy">
          O objetivo é demonstrar um fluxo completo de produto: integração externa, controle de capacidade, emissão de
          ingresso e check-in sem reutilização do mesmo código.
        </p>
      </section>

      <section className="area-overview" aria-label="Áreas da aplicação">
        {areaCards.map((area) => (
          <button
            className={`area-card ${mode === area.mode ? "active" : ""}`}
            key={area.mode}
            onClick={() => onSelectMode(area.mode)}
            type="button"
          >
            <span className="area-step">{area.step}</span>
            <strong>{area.title}</strong>
            <span>{area.description}</span>
          </button>
        ))}
      </section>

      {error ? <StateBlock title="Entrada não concluída" text={error} tone="danger" /> : null}

      <div className="demo-actions">
        <button className="wide-action" disabled={loading} onClick={() => onEnter(mode)} type="button">
          {loading ? "Entrando..." : `Entrar como ${roleLabel(role)}`}
        </button>
      </div>
    </div>
  );
}

const areaCards: Array<{mode: Mode; step: string; title: string; description: string}> = [
  {
    mode: "organizer",
    step: "01",
    title: "Organizador",
    description: "Busca filme ou série no catálogo, define data, sala, capacidade e preço, depois publica a sessão.",
  },
  {
    mode: "customer",
    step: "02",
    title: "Cliente",
    description: "Navega pelos pôsteres em cartaz, escolhe uma sessão, simula o pagamento e recebe o ingresso.",
  },
  {
    mode: "gate",
    step: "03",
    title: "Portaria",
    description: "Confere o token do QR Code, libera ingressos válidos e bloqueia códigos inválidos ou já usados.",
  },
];

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
