"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import StatusBadge from "@/components/status-badge";

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

type QrCameraScannerProps = {
  eventName: string;
  onDetected: (value: string) => void;
};

export default function QrCameraScanner({ eventName, onDetected }: QrCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const frameRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "unsupported" | "error">("idle");
  const [message, setMessage] = useState("Activá la cámara para leer un QR o código de acceso.");

  const stopScanner = useCallback(() => {
    runningRef.current = false;

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  const startScanner = useCallback(async () => {
    if (runningRef.current) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setMessage("Tu navegador no soporta cámara. Usá el campo de búsqueda o ingresá el código manualmente.");
      return;
    }

    if (!window.BarcodeDetector) {
      setStatus("unsupported");
      setMessage("Tu navegador no soporta detección de QR nativa. Usá el campo de búsqueda o ingresá el código manualmente.");
      return;
    }

    setStatus("starting");
    setMessage(`Encendiendo cámara para ${eventName}.`);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        throw new Error("No se pudo preparar la vista previa de cámara.");
      }

      video.srcObject = stream;
      await video.play();

      detectorRef.current = detectorRef.current ?? new window.BarcodeDetector({ formats: ["qr_code"] });
      runningRef.current = true;
      setStatus("scanning");
      setMessage("Apuntá al QR o al código de acceso. La validación ocurre al instante.");

      const scanFrame = async () => {
        if (!runningRef.current || !videoRef.current || !detectorRef.current) {
          return;
        }

        try {
          const result = await detectorRef.current.detect(videoRef.current);
          const rawValue = result[0]?.rawValue?.trim();

          if (rawValue) {
            setMessage(`Código detectado: ${rawValue}`);
            onDetected(rawValue);
            stopScanner();
            return;
          }
        } catch (error) {
          if (runningRef.current) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "No se pudo leer el código desde la cámara.");
            stopScanner();
            return;
          }
        }

        if (runningRef.current) {
          frameRef.current = window.requestAnimationFrame(() => {
            void scanFrame();
          });
        }
      };

      frameRef.current = window.requestAnimationFrame(() => {
        void scanFrame();
      });
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo activar la cámara.");
      stopScanner();
    }
  }, [eventName, onDetected, stopScanner]);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Scanner con cámara
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Leer QR o código de acceso
          </h2>
        </div>
        <StatusBadge variant={status === "scanning" ? "success" : status === "unsupported" || status === "error" ? "warning" : "info"}>
          {status === "scanning" ? "Activo" : status === "starting" ? "Encendiendo" : status === "unsupported" ? "Fallback" : status === "error" ? "Error" : "Listo"}
        </StatusBadge>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-950/60">
          <div className="relative aspect-video">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-0 border-8 border-transparent">
              <div className="absolute inset-6 rounded-[1.3rem] border border-cyan-400/55 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
            </div>
          </div>
          <div className="border-t border-white/10 px-4 py-3 text-xs uppercase tracking-[0.22em] text-slate-400">
            Escaneo operativo para {eventName}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
          <div className="space-y-3">
            <p className="text-sm leading-6 text-slate-300">
              La cámara detecta QR o códigos de acceso en segundos. Si el navegador no lo soporta, el flujo sigue disponible con búsqueda manual.
            </p>
            <div className="grid gap-3 rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
              <p>1. Activá la cámara.</p>
              <p>2. Apuntá al QR o al access code.</p>
              <p>3. El check-in queda validado en el evento activo.</p>
            </div>
            <p className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
              {message}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {status === "scanning" ? (
              <button
                type="button"
                onClick={stopScanner}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 text-sm font-medium text-amber-50 transition hover:bg-amber-400/15"
              >
                Detener cámara
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startScanner()}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
              >
                Activar cámara
              </button>
            )}
            <button
              type="button"
              onClick={stopScanner}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Reiniciar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
