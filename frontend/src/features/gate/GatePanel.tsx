import {FormEvent, useEffect, useRef, useState} from "react";
import jsQR from "jsqr";

import {checkIn, listEvents} from "../../lib/api";
import type {AuthSession, Event, GateValidationResult} from "../../lib/types";

type Props = {
  session: AuthSession;
};

export function GatePanel({session}: Props) {
  const [token, setToken] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [result, setResult] = useState<GateValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    async function loadGateEvents() {
      try {
        const result = await listEvents();
        setEvents(result);
        setSelectedEventId((current) => current || result[0]?.id || "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as sessões.");
      }
    }

    loadGateEvents();
  }, []);

  async function validateToken(value: string, eventId: string) {
    if (!eventId) {
      setError("Selecione a sessão da entrada antes de validar.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const normalizedToken = extractTicketToken(value);
      setToken(normalizedToken);
      setResult(await checkIn(session, normalizedToken, eventId));
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Não encontramos um ingresso válido com esse código.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await validateToken(token, selectedEventId);
  }

  async function startCamera() {
    setCameraMessage(null);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}});
      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraMessage("Não foi possível acessar a câmera. Use a digitação manual.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !canvasRef.current) return;

    let cancelled = false;

    async function scan() {
      if (cancelled || !videoRef.current || !canvasRef.current) return;

      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const width = video.videoWidth;
        const height = video.videoHeight;

        if (!width || !height) return;

        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", {willReadFrequently: true});
        if (!context) return;

        context.drawImage(video, 0, 0, width, height);
        const image = context.getImageData(0, 0, width, height);
        const code = jsQR(image.data, image.width, image.height);
        const value = code?.data;

        if (value) {
          const normalizedToken = extractTicketToken(value);
          setToken(normalizedToken);
          setCameraMessage("QR Code lido. Validando entrada automaticamente.");
          stopCamera();
          await validateToken(normalizedToken, selectedEventId);
        }
      } catch {
        setCameraMessage("Não foi possível ler o QR Code. Tente aproximar a câmera ou digite o código.");
      }
    }

    const interval = window.setInterval(scan, 900);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [cameraActive, selectedEventId]);

  useEffect(() => () => stopCamera(), []);

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
            Sessão da entrada
            <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)} required>
              <option value="">Selecione uma sessão</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} · {new Date(event.startsAt).toLocaleString("pt-BR")} · {event.venue}
                </option>
              ))}
            </select>
          </label>

          <div className="camera-reader">
            <div className="video-frame">
              {cameraActive ? <video muted playsInline ref={videoRef} /> : <span>Câmera desligada</span>}
              <canvas ref={canvasRef} hidden />
            </div>
            <div className="camera-actions">
              <button className="ghost-button" onClick={cameraActive ? stopCamera : startCamera} type="button">
                {cameraActive ? "Parar câmera" : "Ler QR pela câmera"}
              </button>
              {cameraMessage && <p className="copy-hint">{cameraMessage}</p>}
            </div>
          </div>

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

function extractTicketToken(value: string): string {
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const hashToken = hashParams.get("ticket");
    if (hashToken) return hashToken;

    const queryToken = url.searchParams.get("ticket");
    if (queryToken) return queryToken;
  } catch {
    return trimmed;
  }

  return trimmed;
}
