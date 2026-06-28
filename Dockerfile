# ─── Stage 1: Build ───────────────────────────────────────────────────────────
# Usa eclipse-temurin:21 (Java 21 LTS) como base para ter Java disponível no build
FROM eclipse-temurin:21-jdk-noble AS builder

# Instalar Node.js 22 + pnpm
RUN apt-get update && apt-get install -y curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm@10.4.1 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Instalar todas as dependências (incluindo devDependencies para o build)
RUN pnpm install --frozen-lockfile

# Copiar código fonte completo
COPY . .

# Build: vite (frontend) + esbuild (backend) + copia de tools/dropper/dropper-template
RUN pnpm build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
# Imagem menor para produção — apenas JRE (não JDK)
FROM eclipse-temurin:21-jre-noble AS runtime

# Instalar Node.js 22 (apenas runtime, sem pnpm/devtools)
RUN apt-get update && apt-get install -y curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar apenas artefatos necessários do stage de build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Criar diretório de storage temporário
RUN mkdir -p /tmp/apk-storage

# Porta do servidor
EXPOSE 3000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV STORAGE_DIR=/tmp/apk-storage

# Iniciar o servidor
CMD ["node", "dist/index.js"]
