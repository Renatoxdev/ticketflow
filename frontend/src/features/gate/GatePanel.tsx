import {FormEvent, useState} from "react";

import {checkIn} from "../../lib/api";
import type {AuthSession, GateValidationResult} from "../../lib/types";

type Props = {
  session: AuthSession;
};

export function GatePanel({session}: Props) {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<GateValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      setResult(await checkIn(session, token.trim()));
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Não encontramos um ingresso válido com esse código.");
    } finally {
      setLoading(false);
    }
  }

  const tone = result?.status === "VALID" ? "success" : result ? "warning" : error ? "danger" : "neutral";

  return (
    <div className="gate-layout">
      <header className="flow-header">
        <p className="section-label">Portaria</p>
        <h2>Validar ingresso</h2>
      </header>

      <section className="panel gate-console">
        <form onSubmit={handleSubmit}>
          <label>
            Código do ingresso
            <textarea
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Cole aqui o código do ingresso ou leia o QR Code"
              required
              rows={5}
            />
          </label>
          <button className="wide-action" disabled={loading} type="submit">
            {loading ? "Conferindo" : "Validar entrada"}
          </button>
        </form>

        <div className={`gate-result ${tone}`}>
          <p className="section-label">Status da entrada</p>
          <strong>{result?.message ?? error ?? "Aguardando ingresso"}</strong>
          {result?.checkedInAt && <span>{new Date(result.checkedInAt).toLocaleString("pt-BR")}</span>}
        </div>
      </section>
    </div>
  );
}
