import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Shield,
  CheckCircle2,
  XCircle,
  Download,
  FileCode2,
  Cpu,
  Lock,
  Wifi,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type JobStatus = "idle" | "uploading" | "pending" | "processing" | "done" | "error";

interface JobState {
  jobId: string | null;
  status: JobStatus;
  progress: number;
  log: string[];
  downloadUrl: string | null;
  originalName: string | null;
  errorMessage: string | null;
}

const INITIAL_STATE: JobState = {
  jobId: null,
  status: "idle",
  progress: 0,
  log: [],
  downloadUrl: null,
  originalName: null,
  errorMessage: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: JobStatus): string {
  switch (status) {
    case "uploading": return "Enviando APK...";
    case "pending": return "Na fila de processamento...";
    case "processing": return "Injetando VPN e permissões...";
    case "done": return "APK modificado com sucesso!";
    case "error": return "Erro no processamento";
    default: return "";
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Home() {
  const [job, setJob] = useState<JobState>(INITIAL_STATE);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showFullLog, setShowFullLog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll do log
  useEffect(() => {
    if (showFullLog) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [job.log, showFullLog]);

  // Cleanup polling
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Polling de status ──────────────────────────────────────────────────────

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/apk/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();

        setJob((prev) => ({
          ...prev,
          status: data.status as JobStatus,
          progress: data.progress,
          log: data.log || [],
          downloadUrl: data.downloadUrl,
          errorMessage: data.errorMessage,
          originalName: data.originalName || prev.originalName,
        }));

        if (data.status === "done" || data.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (data.status === "done") {
            toast.success("APK modificado com sucesso!", {
              description: "Clique em Download para baixar o APK.",
            });
          } else {
            toast.error("Erro no processamento", {
              description: data.errorMessage || "Tente novamente.",
            });
          }
        }
      } catch {
        // silencioso
      }
    }, 1500);
  }, []);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".apk")) {
      toast.error("Arquivo inválido", { description: "Apenas arquivos .apk são aceitos." });
      return;
    }

    setSelectedFile(file);
    setJob({ ...INITIAL_STATE, status: "uploading", originalName: file.name });
    setShowFullLog(false);

    const formData = new FormData();
    formData.append("apk", file);

    try {
      const res = await fetch("/api/apk/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha no upload");
      }

      const { jobId } = await res.json();

      setJob((prev) => ({
        ...prev,
        jobId,
        status: "pending",
        progress: 5,
      }));

      startPolling(jobId);
    } catch (err) {
      setJob((prev) => ({
        ...prev,
        status: "error",
        errorMessage: (err as Error).message,
      }));
      toast.error("Falha no upload", { description: (err as Error).message });
    }
  }, [startPolling]);

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  const isProcessing = ["uploading", "pending", "processing"].includes(job.status);

  // ── Download ───────────────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!job.jobId) return;
    const link = document.createElement("a");
    link.href = `/api/apk/download/${job.jobId}`;
    link.download = (job.originalName || "app").replace(/\.apk$/i, "") + "_vpn_injected.apk";
    link.click();
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setJob(INITIAL_STATE);
    setSelectedFile(null);
    setShowFullLog(false);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background bg-grid-pattern relative overflow-hidden">
      {/* Glow de fundo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.72 0.18 175 / 0.08), transparent)",
        }}
      />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header className="border-b border-border/50 backdrop-blur-sm bg-background/60 sticky top-0 z-20">
          <div className="container flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div>
                <span className="font-semibold text-foreground tracking-tight">VPN APK Injector</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">v1.0</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/dropper"
                className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
              >
                APK Dropper
              </a>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Serviço ativo
              </div>
            </div>
          </div>
        </header>

        {/* ── Main ──────────────────────────────────────────────────────────── */}
        <main className="flex-1 container py-12 flex flex-col items-center gap-10">

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="text-center max-w-2xl"
          >
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3">
              Injete VPN nativa em{" "}
              <span className="text-primary">qualquer APK</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Faça upload do seu APK e o painel irá automaticamente injetar o serviço{" "}
              <code className="text-primary font-mono text-sm bg-primary/10 px-1.5 py-0.5 rounded">VpnService</code>{" "}
              e a permissão de acessibilidade{" "}
              <code className="text-primary font-mono text-sm bg-primary/10 px-1.5 py-0.5 rounded">BIND_ACCESSIBILITY_SERVICE</code>{" "}
              no manifest.
            </p>
          </motion.div>

          {/* Feature badges */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
            className="flex flex-wrap justify-center gap-3"
          >
            {[
              { icon: Wifi, label: "VpnService injetado" },
              { icon: Lock, label: "BIND_ACCESSIBILITY_SERVICE" },
              { icon: FileCode2, label: "Manifest modificado" },
              { icon: Cpu, label: "Assinatura digital" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs text-muted-foreground"
              >
                <Icon className="w-3.5 h-3.5 text-primary" />
                {label}
              </div>
            ))}
          </motion.div>

          {/* ── Upload Area ──────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-2xl"
          >
            <AnimatePresence mode="wait">
              {job.status === "idle" ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200
                      flex flex-col items-center justify-center gap-5 p-16
                      ${isDragging
                        ? "border-primary bg-primary/5 scale-[1.01]"
                        : "border-border hover:border-primary/50 hover:bg-card/50 bg-card/30"
                      }
                    `}
                    style={{
                      boxShadow: isDragging
                        ? "0 0 0 4px oklch(0.72 0.18 175 / 0.15), inset 0 0 40px oklch(0.72 0.18 175 / 0.05)"
                        : undefined,
                    }}
                  >
                    <div
                      className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                        isDragging
                          ? "bg-primary/20 animate-pulse-ring"
                          : "bg-card border border-border"
                      }`}
                    >
                      <Upload
                        className={`w-9 h-9 transition-colors duration-200 ${
                          isDragging ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-foreground font-semibold text-lg mb-1">
                        {isDragging ? "Solte o APK aqui" : "Arraste seu APK aqui"}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        ou{" "}
                        <span className="text-primary underline underline-offset-2">
                          clique para selecionar
                        </span>
                      </p>
                      <p className="text-muted-foreground/60 text-xs mt-2">
                        Apenas arquivos .apk · Máximo 200 MB
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".apk,application/vnd.android.package-archive"
                      className="hidden"
                      onChange={onFileChange}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  className="rounded-2xl border border-border bg-card overflow-hidden"
                >
                  {/* Header do card */}
                  <div className="px-6 pt-6 pb-4 border-b border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            job.status === "done"
                              ? "bg-primary/15"
                              : job.status === "error"
                              ? "bg-destructive/15"
                              : "bg-primary/10"
                          }`}
                        >
                          {job.status === "done" ? (
                            <CheckCircle2 className="w-5 h-5 text-primary" />
                          ) : job.status === "error" ? (
                            <XCircle className="w-5 h-5 text-destructive" />
                          ) : (
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">
                            {job.originalName || selectedFile?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {selectedFile ? formatBytes(selectedFile.size) : ""}
                          </p>
                        </div>
                      </div>
                      {!isProcessing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleReset}
                          className="text-muted-foreground hover:text-foreground text-xs"
                        >
                          Novo APK
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progresso */}
                  <div className="px-6 py-5">
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-sm font-medium ${
                          job.status === "done"
                            ? "text-primary"
                            : job.status === "error"
                            ? "text-destructive"
                            : "text-foreground"
                        }`}
                      >
                        {statusLabel(job.status)}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {job.progress}%
                      </span>
                    </div>
                    <div className="relative">
                      <Progress
                        value={job.progress}
                        className={`h-2 ${
                          job.status === "error" ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"
                        } ${isProcessing ? "animate-progress-glow" : ""}`}
                      />
                    </div>
                  </div>

                  {/* Log */}
                  {job.log.length > 0 && (
                    <div className="px-6 pb-6">
                      <button
                        onClick={() => setShowFullLog((v) => !v)}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 w-full"
                      >
                        <div className="flex-1 h-px bg-border" />
                        <span className="flex items-center gap-1.5 shrink-0">
                          {showFullLog ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" /> Ocultar log
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" /> Ver log completo ({job.log.length} linhas)
                            </>
                          )}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </button>

                      <AnimatePresence>
                        {showFullLog && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="rounded-xl bg-background/80 border border-border/50 p-4 max-h-64 overflow-y-auto">
                              <div className="space-y-1">
                                {job.log.map((line, i) => (
                                  <motion.p
                                    key={i}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.2, delay: i * 0.02 }}
                                    className="text-xs font-mono text-muted-foreground leading-relaxed"
                                  >
                                    {line}
                                  </motion.p>
                                ))}
                                <div ref={logEndRef} />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Resumo das permissões adicionadas */}
                      {job.status === "done" && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                          className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4"
                        >
                          <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Modificações aplicadas
                          </p>
                          <div className="space-y-1.5">
                            {[
                              { icon: Wifi, label: "VpnService injetado", sub: "com.vpn.injected.VpnTunnelService" },
                              { icon: Lock, label: "Serviço de Acessibilidade", sub: "com.vpn.injected.AccessibilityBridgeService" },
                              { icon: Shield, label: "Permissões adicionadas", sub: "INTERNET · FOREGROUND_SERVICE · BIND_VPN_SERVICE · BIND_ACCESSIBILITY_SERVICE" },
                              { icon: Cpu, label: "APK assinado digitalmente", sub: "RSA-2048 / SHA-256 debug key" },
                            ].map(({ icon: Icon, label, sub }) => (
                              <div key={label} className="flex items-start gap-2">
                                <Icon className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs text-foreground font-medium">{label}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{sub}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Erro */}
                      {job.status === "error" && job.errorMessage && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
                        >
                          <p className="text-xs font-semibold text-destructive mb-1 flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5" />
                            Detalhes do erro
                          </p>
                          <p className="text-xs font-mono text-muted-foreground">{job.errorMessage}</p>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* Botão de download */}
                  {job.status === "done" && job.downloadUrl && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                      className="px-6 pb-6"
                    >
                      <Button
                        onClick={handleDownload}
                        className="w-full h-12 text-sm font-semibold gap-2.5 rounded-xl"
                        style={{
                          background: "oklch(0.72 0.18 175)",
                          color: "oklch(0.09 0.01 260)",
                          boxShadow: "0 0 24px oklch(0.72 0.18 175 / 0.35)",
                        }}
                      >
                        <Download className="w-4.5 h-4.5" />
                        Baixar APK modificado
                      </Button>
                    </motion.div>
                  )}

                  {/* Botão de tentar novamente */}
                  {job.status === "error" && (
                    <div className="px-6 pb-6">
                      <Button
                        onClick={handleReset}
                        variant="outline"
                        className="w-full h-12 text-sm font-semibold gap-2 rounded-xl"
                      >
                        <Upload className="w-4 h-4" />
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── Info cards ────────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            {[
              {
                icon: FileCode2,
                title: "Manifest injetado",
                desc: "VpnService e AccessibilityService adicionados ao AndroidManifest.xml",
              },
              {
                icon: Shield,
                title: "Permissões nativas",
                desc: "BIND_VPN_SERVICE e BIND_ACCESSIBILITY_SERVICE declaradas corretamente",
              },
              {
                icon: Cpu,
                title: "APK assinado",
                desc: "Assinatura digital debug gerada automaticamente para instalação",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-card/50 p-4 flex flex-col gap-2"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </motion.div>
        </main>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="border-t border-border/50 py-6">
          <div className="container flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-primary/60" />
            <span>VPN APK Injector — Ferramenta de modificação de APK Android</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
