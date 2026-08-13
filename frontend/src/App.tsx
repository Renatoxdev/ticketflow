import {FormEvent, useEffect, useState} from "react";
import {QRCodeSVG} from "qrcode.react";

import {CustomerPanel} from "./features/customer/CustomerPanel";
import {GatePanel} from "./features/gate/GatePanel";
import {OrganizerPanel} from "./features/organizer/OrganizerPanel";
import {getSharedTicket, loginUser, registerUser} from "./lib/api";
import type {AuthSession, TicketShare, UserRole} from "./lib/types";

type Mode = "organizer" | "customer" | "gate";
type View = Mode | "home";
type AuthTab = "login" | "register";
type RegisterRole = "CUSTOMER" | "ORGANIZER";

const demoAccounts: Array<{label: string; email: string; password: string; role: UserRole}> = [
  {label: "Organizador demo", email: "admin@ticketflow.com", password: "admin", role: "ORGANIZER"},
  {label: "Cliente user1", email: "user1@ticketflow.com", password: "user1", role: "CUSTOMER"},
  {label: "Cliente user2", email: "user2@ticketflow.com", password: "user2", role: "CUSTOMER"},
  {label: "Portaria demo", email: "portaria@ticketflow.com", password: "portaria", role: "GATE_OPERATOR"},
];

const SESSION_STORAGE_KEY = "ticketflow.session";

function loadStoredSession(): AuthSession | null {
  const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawSession) return null;

  try {
    const parsed = JSON.parse(rawSession) as AuthSession;
    if (!parsed.accessToken || !parsed.email || !parsed.role) return null;
    return parsed;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function saveSession(session: AuthSession) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function viewForRole(role: UserRole): Mode {
  if (role === "ORGANIZER") return "organizer";
  if (role === "CUSTOMER") return "customer";
  return "gate";
}

export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [view, setView] = useState<View>(() => (session ? viewForRole(session.role) : "home"));
  const [sharedTicket, setSharedTicket] = useState<TicketShare | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    async function loadSharedTicket() {
      const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("ticket");
      if (!token) return;

      try {
        setSharedTicket(await getSharedTicket(token));
        setView("home");
      } catch (error) {
        setSharedError(error instanceof Error ? error.message : "Não foi possível carregar o ingresso compartilhado.");
      }
    }

    loadSharedTicket();
  }, []);

  function openView(nextView: View) {
    setView(nextView);
    setAuthError(null);
    setSharedTicket(null);
    setSharedError(null);
  }

  function handleAuthenticated(nextSession: AuthSession) {
    setSession(nextSession);
    saveSession(nextSession);
    setAuthError(null);
    setView(viewForRole(nextSession.role));
  }

  function logout() {
    setSession(null);
    clearStoredSession();
    setView("home");
  }

  async function loginDemo(email: string, password: string) {
    setAuthLoading(true);
    setAuthError(null);

    try {
      handleAuthenticated(await loginUser(email, password));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível entrar com este usuário.");
    } finally {
      setAuthLoading(false);
    }
  }

  let panel = sharedTicket || sharedError ? (
    <SharedTicketPanel error={sharedError} ticket={sharedTicket} />
  ) : view === "home" ? (
    <HomePanel
      loading={authLoading}
      error={authError}
      session={session}
      onLoginDemo={loginDemo}
      onAuthenticated={handleAuthenticated}
      onAuthError={setAuthError}
      onAuthLoading={setAuthLoading}
    />
  ) : session?.role === "ORGANIZER" ? (
    <OrganizerPanel session={session} />
  ) : session?.role === "CUSTOMER" ? (
    <CustomerPanel session={session} />
  ) : session?.role === "GATE_OPERATOR" ? (
    <GatePanel session={session} />
  ) : (
    <HomePanel
      loading={authLoading}
      error={authError}
      session={session}
      onLoginDemo={loginDemo}
      onAuthenticated={handleAuthenticated}
      onAuthError={setAuthError}
      onAuthLoading={setAuthLoading}
    />
  );

  return (
    <>
      <div className="top-nav-zone">
        <header className="top-nav" aria-label="Navegação principal">
          <div className="top-brand">
            <p className="brand-kicker">Cinema e ingressos</p>
            <h1>TicketFlow</h1>
          </div>

          <nav className="mode-switcher">
            <button className={view === "home" ? "active" : ""} onClick={() => openView("home")} type="button">
              Home
            </button>
            {session && (
              <button className={view !== "home" ? "active" : ""} onClick={() => openView(viewForRole(session.role))} type="button">
                {areaTitle(viewForRole(session.role))}
              </button>
            )}
          </nav>

          <div className="rail-status">
            <span className="status-dot" />
            <span>{session ? session.email : "Faça login para acessar as áreas"}</span>
            {session && (
              <button className="inline-logout" onClick={logout} type="button">
                Sair
              </button>
            )}
          </div>
        </header>
      </div>

      <main className="app-shell">
        <section className="workspace">{panel}</section>
      </main>
    </>
  );
}

function SharedTicketPanel({ticket, error}: {ticket: TicketShare | null; error: string | null}) {
  return (
    <div className="demo-login">
      <section className="intro-panel compact-auth">
        <p className="section-label">Ingresso compartilhado</p>
        <h2>TicketFlow</h2>
        <p className="demo-copy">
          Este ingresso foi aberto por link de compartilhamento. A portaria ainda precisa validar o QR Code na entrada.
        </p>
      </section>

      {error && <StateBlock title="Ingresso não encontrado" text={error} tone="danger" />}

      {ticket && (
        <section className="shared-ticket-card">
          <div className="qr-box">
            <QRCodeSVG value={ticket.qrPayload} size={176} />
          </div>
          <div>
            <p className="section-label">Código seguro</p>
            <h3>Assento {ticket.seatLabel ?? "-"}</h3>
            <p>Status: {ticket.status}</p>
            <code>{ticket.token}</code>
          </div>
        </section>
      )}
    </div>
  );
}

function HomePanel({
  loading,
  error,
  session,
  onLoginDemo,
  onAuthenticated,
  onAuthError,
  onAuthLoading,
}: AuthPanelProps & {session: AuthSession | null}) {
  return (
    <div className="demo-login">
      <section className="intro-panel">
        <p className="section-label">Sobre o projeto</p>
        <h2>Bilheteria online para sessões de cinema</h2>
        <p className="demo-copy">
          O TicketFlow simula uma plataforma de ingressos para filmes e séries. O organizador cria sessões usando
          dados da TMDb, o cliente compra um ingresso com pagamento simulado e a portaria valida o QR Code na entrada.
        </p>
        <p className="demo-copy">
          O objetivo é demonstrar um fluxo completo de produto: integração externa, controle de capacidade, emissão de
          ingresso e check-in sem reutilização do mesmo código.
        </p>
        {session && <StateBlock title="Usuário conectado" text={`${session.email} · ${roleLabel(session.role)}`} />}
      </section>

      <section className="area-overview" aria-label="Áreas da aplicação">
        {areaCards.map((area) => (
          <article className="area-card" key={area.mode}>
            <span className="area-step">{area.step}</span>
            <strong>{area.title}</strong>
            <span>{area.description}</span>
          </article>
        ))}
      </section>

      <AuthCard
        loading={loading}
        error={error}
        onLoginDemo={onLoginDemo}
        onAuthenticated={onAuthenticated}
        onAuthError={onAuthError}
        onAuthLoading={onAuthLoading}
      />
    </div>
  );
}

type AuthPanelProps = {
  loading: boolean;
  error: string | null;
  onLoginDemo: (email: string, password: string) => Promise<void>;
  onAuthenticated: (session: AuthSession) => void;
  onAuthError: (error: string | null) => void;
  onAuthLoading: (loading: boolean) => void;
};

function AuthCard({
  loading,
  error,
  preferredRole = "CUSTOMER",
  onLoginDemo,
  onAuthenticated,
  onAuthError,
  onAuthLoading,
}: AuthPanelProps & {preferredRole?: UserRole}) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [loginForm, setLoginForm] = useState({email: "", password: ""});
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
    role: (preferredRole === "GATE_OPERATOR" ? "CUSTOMER" : preferredRole) as RegisterRole,
  });

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    onAuthLoading(true);
    onAuthError(null);

    try {
      onAuthenticated(await loginUser(loginForm.email, loginForm.password));
    } catch (loginError) {
      onAuthError(loginError instanceof Error ? loginError.message : "Não foi possível entrar.");
    } finally {
      onAuthLoading(false);
    }
  }

  async function submitRegister(event: FormEvent) {
    event.preventDefault();
    onAuthLoading(true);
    onAuthError(null);

    try {
      onAuthenticated(
        await registerUser(
          registerForm.role,
          registerForm.email,
          registerForm.password,
          registerForm.name,
        ),
      );
    } catch (registerError) {
      onAuthError(registerError instanceof Error ? registerError.message : "Não foi possível criar usuário.");
    } finally {
      onAuthLoading(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-tabs">
        <button className={tab === "login" ? "active" : ""} onClick={() => setTab("login")} type="button">
          Entrar
        </button>
        <button className={tab === "register" ? "active" : ""} onClick={() => setTab("register")} type="button">
          Criar conta
        </button>
      </div>

      {tab === "login" ? (
        <form className="auth-form" onSubmit={submitLogin}>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setLoginForm({...loginForm, email: event.target.value})}
              placeholder="seu@email.com"
              type="email"
              value={loginForm.email}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="current-password"
              onChange={(event) => setLoginForm({...loginForm, password: event.target.value})}
              placeholder="Sua senha"
              type="password"
              value={loginForm.password}
            />
          </label>
          <button className="wide-action" disabled={loading} type="submit">
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={submitRegister}>
          <label>
            Nome
            <input
              autoComplete="name"
              onChange={(event) => setRegisterForm({...registerForm, name: event.target.value})}
              placeholder="Seu nome"
              value={registerForm.name}
            />
          </label>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setRegisterForm({...registerForm, email: event.target.value})}
              placeholder="seu@email.com"
              type="email"
              value={registerForm.email}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="new-password"
              minLength={4}
              onChange={(event) => setRegisterForm({...registerForm, password: event.target.value})}
              placeholder="Mínimo 4 caracteres"
              type="password"
              value={registerForm.password}
            />
          </label>
          <label>
            Tipo de conta
            <select
              onChange={(event) => setRegisterForm({...registerForm, role: event.target.value as RegisterRole})}
              value={registerForm.role}
            >
              <option value="CUSTOMER">Cliente</option>
              <option value="ORGANIZER">Organizador</option>
            </select>
          </label>
          <button className="wide-action" disabled={loading} type="submit">
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </form>
      )}

      {error ? <StateBlock title="Acesso não concluído" text={error} tone="danger" /> : null}

      <div className="demo-account-list">
        <p className="section-label">Usuários de teste</p>
        {demoAccounts.map((account) => (
          <button disabled={loading} key={account.email} onClick={() => onLoginDemo(account.email, account.password)} type="button">
            <strong>{account.label}</strong>
            <span>{account.email} / {account.password}</span>
          </button>
        ))}
      </div>
    </section>
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

function areaTitle(mode: Mode) {
  if (mode === "organizer") return "Área do organizador";
  if (mode === "customer") return "Área do cliente";
  return "Área da portaria";
}

function StateBlock({title, text, tone = "neutral"}: {title: string; text: string; tone?: "neutral" | "danger"}) {
  return (
    <div className={`state-block ${tone}`}>
      <p className="section-label">{title}</p>
      <p>{text}</p>
    </div>
  );
}
