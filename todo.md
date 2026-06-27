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
- [ ] Salvar checkpoint final e publicar
- [x] Rotas REST `/api/apk` implementadas (upload, status, download) — tRPC não necessário para este fluxo
- [x] Salvar checkpoint final e publicar

## Fase 2 — APK Dropper

- [ ] Criar template de APK dropper base (ZIP com manifest + classes.dex stub + assets)
- [ ] Backend: endpoint POST /api/dropper/build (recebe APK alvo + ícone PNG + nome do app)
- [ ] Backend: substituir ícone no dropper (mipmap-* densidades)
- [ ] Backend: substituir nome do app no strings.xml do dropper
- [ ] Backend: embutir APK alvo como asset dentro do dropper (assets/payload.apk)
- [ ] Backend: atualizar AndroidManifest.xml do dropper com VpnService + BIND_ACCESSIBILITY_SERVICE
- [ ] Backend: recompactar e assinar o dropper final
- [ ] Backend: endpoint GET /api/dropper/status/:id e download/:id
- [ ] Frontend: nova seção "Gerar APK Dropper" com upload de APK alvo
- [ ] Frontend: campo de texto para nome do app dropper
- [ ] Frontend: upload/preview de ícone PNG para o dropper
- [ ] Frontend: barra de progresso e log do build do dropper
- [ ] Frontend: botão de download do APK dropper gerado
- [ ] Testes Vitest para o builder do dropper
