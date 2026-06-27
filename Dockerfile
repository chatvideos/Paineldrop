FROM node:20-slim

# Instalar Java JRE (necessário para apktool e uber-apk-signer)
RUN apt-get update && apt-get install -y \
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Verificar que o Java está disponível
RUN java -version

# Instalar pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./

# Instalar dependências (sem scripts de build de dependências)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copiar código fonte
COPY . .

# Build
RUN pnpm build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
