# VPN APK Injector — TODO

- [x] Instalar dependências de manipulação de APK (adm-zip, multer, node-forge, xmldom)
- [x] Criar tabela `apk_jobs` no schema Drizzle para rastrear jobs de processamento
- [x] Aplicar migration SQL da tabela `apk_jobs`
- [x] Implementar helper de storage S3 para APKs (upload/download)
- [x] Criar endpoint REST `/api/apk/upload` para receber o APK via multipart
- [x] Criar lógica de descompactação do APK (ZIP)
- [x] Criar lógica de injeção de VpnService no AndroidManifest.xml
- [x] Criar lógica de injeção de permissão BIND_ACCESSIBILITY_SERVICE no manifest
- [x] Criar lógica de recompactação do APK modificado
- [x] Criar lógica de assinatura digital do APK (jarsigner / node-forge)
- [x] Criar endpoint de status/progresso do job (SSE ou polling)
- [x] Criar endpoint de download do APK modificado
- [x] Criar procedimento tRPC `apk.upload`, `apk.status`, `apk.download`
- [x] Implementar frontend: página principal com upload drag-and-drop
- [x] Implementar indicador de progresso animado durante processamento
- [x] Implementar painel de log resumido com permissões adicionadas
- [x] Implementar botão de download do APK modificado
- [x] Remover qualquer tela/fluxo de autenticação — acesso público direto
- [x] Aplicar design elegante e sofisticado (dark theme, tipografia refinada)
- [x] Escrever testes Vitest para o backend de injeção
- [x] Salvar checkpoint final e publicar
- [x] Rotas REST `/api/apk` implementadas (upload, status, download) — tRPC não necessário para este fluxo
- [x] Salvar checkpoint final e publicar

## Fase 2 — APK Dropper

- [x] Criar template de APK dropper base (ZIP com manifest + classes.dex stub + assets)
- [x] Backend: endpoint POST /api/dropper/build (recebe APK alvo + ícone PNG + nome do app)
- [x] Backend: substituir ícone no dropper (mipmap-* densidades)
- [x] Backend: substituir nome do app no strings.xml do dropper
- [x] Backend: embutir APK alvo como asset dentro do dropper (assets/payload.apk)
- [x] Backend: atualizar AndroidManifest.xml do dropper com VpnService + BIND_ACCESSIBILITY_SERVICE
- [x] Backend: recompactar e assinar o dropper final
- [x] Backend: endpoint GET /api/dropper/status/:id e download/:id
- [x] Frontend: nova seção "Gerar APK Dropper" com upload de APK alvo
- [x] Frontend: campo de texto para nome do app dropper
- [x] Frontend: upload/preview de ícone PNG para o dropper
- [x] Frontend: barra de progresso e log do build do dropper
- [x] Frontend: botão de download do APK dropper gerado
- [x] Testes Vitest para o builder do dropper

## Fase 3 — Injeção Real (replica concorrente com ChatStore2.apk)
- [x] Criar dropperInjector.ts com lógica AES-256-CBC + patch dex + assinatura
- [x] Criar cryptoUtils.ts com Adler32 e SHA-1 para patch do dex
- [x] Atualizar dropperRoutes.ts para usar injectDropper (novo endpoint /api/dropper/inject)
- [x] Atualizar frontend para usar o novo modo de injeção real (nova página /inject)
- [x] Testes Vitest para o injector (37 testes totais: Adler32, SHA-1, AES-256-CBC, AXML parser, extractPackageNameFromApk, encryptApk — importando o código real de produção)
- [x] Salvar checkpoint final
