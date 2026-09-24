# videochamada

Aplicativo web de chamadas de vídeo e áudio, com compartilhamento de tela,
pronto para publicar em um repositório do GitHub e hospedar na Vercel.

Feito com **Next.js 14 (App Router) + TypeScript + Tailwind CSS**, **WebRTC**
para mídia em tempo real e **Pusher Channels** para sinalização.

---

## Sumário

1. [Como funciona (arquitetura)](#como-funciona-arquitetura)
2. [Serviços externos necessários](#serviços-externos-necessários)
3. [Rodando localmente](#rodando-localmente)
4. [Publicando no GitHub e implantando na Vercel](#publicando-no-github-e-implantando-na-vercel)
5. [Custos e limites](#custos-e-limites)
6. [Limitações conhecidas](#limitações-conhecidas)
7. [Estrutura do projeto](#estrutura-do-projeto)

---

## Como funciona (arquitetura)

Chamadas de vídeo em tempo real precisam de duas coisas que **funções
serverless da Vercel não fazem bem sozinhas**: uma conexão persistente para
troca de sinalização (quem entrou, ofertas/respostas WebRTC, candidatos ICE) e,
às vezes, um servidor de retransmissão de mídia (TURN) quando a conexão direta
entre dois navegadores não é possível. Por isso este projeto combina:

- **Next.js na Vercel** — interface, páginas e duas rotas de API leves
  (`/api/pusher/auth` e `/api/turn-credentials`), que são funções serverless
  comuns e não precisam manter conexão aberta.
- **Pusher Channels** (serviço externo) — mantém o WebSocket de sinalização.
  Cada sala é um canal de presença (`presence-room-<id>`). Ele nos diz quem
  está na sala em tempo real e transporta as mensagens de sinalização do
  WebRTC (`offer`/`answer`/`ice-candidate`) como "client events" trocados
  diretamente entre os navegadores dos participantes.
- **WebRTC (no navegador)** — depois que dois participantes trocam a
  sinalização, o áudio, o vídeo e o compartilhamento de tela trafegam
  **direto entre os navegadores** (peer-to-peer), sem passar pelo servidor.
  Isso é o que dá baixa latência e não sobrecarrega a Vercel.
- **STUN (Google, gratuito)** — ajuda dois navegadores a descobrirem como se
  alcançar através de NAT/roteador.
- **TURN (Metered.ca ou outro provedor)** — usado só quando a conexão direta
  falha (redes corporativas, alguns 4G/5G, dupla NAT). As credenciais são
  geradas no servidor (rota `/api/turn-credentials`) para nunca expor a chave
  de API do provedor de TURN no navegador.

A topologia de chamada é **mesh** (cada participante mantém uma conexão
direta com todos os demais). Isso é simples e funciona muito bem para salas
pequenas (recomendado até ~6 pessoas); veja [Limitações](#limitações-conhecidas).

---

## Serviços externos necessários

### 1. Pusher Channels (obrigatório — sinalização)

Sem isso, o app não consegue conectar duas pessoas na mesma sala.

1. Crie uma conta gratuita em <https://pusher.com>.
2. Crie um app em **Channels** (escolha qualquer região/cluster).
3. Em **App Keys**, copie `app_id`, `key`, `secret` e `cluster`.
4. Em **App Settings**, habilite **"Enable client events"** — isso é
   obrigatório, pois é assim que os navegadores trocam as mensagens de
   sinalização do WebRTC entre si.
5. Preencha no `.env.local` (ou nas variáveis de ambiente da Vercel):
   ```
   PUSHER_APP_ID=...
   PUSHER_SECRET=...
   NEXT_PUBLIC_PUSHER_KEY=...
   NEXT_PUBLIC_PUSHER_CLUSTER=...
   ```

**Plano gratuito (Sandbox):** 200 mil mensagens/dia e 100 conexões
simultâneas — suficiente para testes e uso pessoal/pequenas equipes.

### 2. Servidor TURN (recomendado — necessário para redes restritivas)

Sem um TURN configurado, o app **ainda funciona** entre a maioria das redes
domésticas (usando apenas STUN), mas chamadas entre pessoas em redes
corporativas, algumas redes móveis ou com NAT simétrico podem falhar em
conectar.

**Opção A — Metered.ca (recomendada, mais simples):**

1. Crie uma conta gratuita em <https://www.metered.ca/tools/openrelay/>.
2. Crie um app de TURN Server e copie a **API Key** e o **nome do app**
   (o subdomínio, ex.: `meuapp` em `meuapp.metered.live`).
3. Preencha:
   ```
   METERED_API_KEY=...
   METERED_APP_NAME=...
   ```
   A rota `/api/turn-credentials` busca credenciais de curta duração nessa
   API a cada nova chamada — a chave nunca chega ao navegador.

**Opção B — TURN próprio ou outro provedor (Twilio, Cloudflare, coturn):**

Preencha em vez disso:
```
TURN_URL=turn:seu-servidor:3478
TURN_USERNAME=...
TURN_CREDENTIAL=...
```

Se nenhuma das duas opções for configurada, o app funciona apenas com STUN.

### 3. URL pública da aplicação (opcional)

`NEXT_PUBLIC_APP_URL` é só um valor de reserva para montar o link de convite
quando não é possível ler a origem do navegador. Em produção na Vercel isso
não costuma ser necessário, pois o link é montado a partir da URL atual.

---

## Rodando localmente

Pré-requisitos: Node.js 18.18+ (recomendado 20+) e npm.

```bash
# 1. instalar dependências
npm install

# 2. configurar variáveis de ambiente
cp .env.example .env.local
# edite .env.local com as credenciais do Pusher (e, opcionalmente, do TURN)

# 3. rodar em desenvolvimento
npm run dev
```

Abra <http://localhost:3000>. Para testar uma chamada de verdade, abra a
mesma sala em duas abas/navegadores (ou dois dispositivos na mesma rede,
acessando seu IP local) — **compartilhamento de tela e alguns navegadores só
liberam câmera/microfone em `localhost` ou HTTPS**, então em produção o
HTTPS da Vercel já resolve isso automaticamente.

Para gerar o build de produção localmente:

```bash
npm run build
npm run start
```

---

## Publicando no GitHub e implantando na Vercel

### 1. Suba o projeto para o GitHub

```bash
git init
git add .
git commit -m "Primeira versão do videochamada"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/videochamada.git
git push -u origin main
```

### 2. Importe o projeto na Vercel

1. Acesse <https://vercel.com/new> e conecte sua conta do GitHub.
2. Selecione o repositório `videochamada`.
3. A Vercel detecta automaticamente que é um projeto Next.js — não é
   necessário alterar o *build command* (`next build`) nem o *output*.
4. Antes de clicar em **Deploy**, adicione as variáveis de ambiente (aba
   **Environment Variables**):
   - `PUSHER_APP_ID`
   - `PUSHER_SECRET`
   - `NEXT_PUBLIC_PUSHER_KEY`
   - `NEXT_PUBLIC_PUSHER_CLUSTER`
   - `METERED_API_KEY` e `METERED_APP_NAME` (ou `TURN_URL` / `TURN_USERNAME` /
     `TURN_CREDENTIAL`, se for usar outro provedor de TURN)
5. Clique em **Deploy**. Em cerca de 1 minuto o app estará no ar em
   `https://<seu-projeto>.vercel.app`, já em HTTPS.

### 3. Deploys seguintes

Qualquer `git push` na branch `main` gera um novo deploy de produção
automaticamente. Pull requests geram *preview deployments* com URL própria.

Se alterar variáveis de ambiente depois do primeiro deploy, é preciso fazer
um **redeploy** (aba *Deployments* → menu **⋯** → *Redeploy*) para que elas
sejam aplicadas.

---

## Custos e limites

| Serviço | Plano gratuito | Quando você paga |
|---|---|---|
| **Vercel** (Hobby) | Geroso para uso pessoal; funções serverless com timeout curto (as rotas deste app são rápidas e não dependem disso) | Uso comercial/times exigem plano Pro |
| **Pusher Channels** (Sandbox) | 200 mil mensagens/dia, 100 conexões simultâneas | Salas muito grandes ou tráfego alto de sinalização |
| **Metered.ca TURN** (free) | 20 GB/mês de relay TURN | Acima de 20 GB/mês de tráfego relayado (cobrado por GB) |

O **áudio e vídeo em si não passam pela Vercel nem pelo Pusher** — trafegam
direto entre os navegadores (ou pelo relay TURN, só quando necessário), então
o consumo desses serviços tende a ser pequeno mesmo com várias chamadas.

---

## Limitações conhecidas

- **Topologia mesh:** cada participante se conecta diretamente a todos os
  outros. Funciona bem até ~6 pessoas por sala; a partir disso, o consumo de
  CPU/banda de cada participante cresce rapidamente. Para salas maiores seria
  necessário um SFU (ex.: mediasoup, LiveKit, Janus) — fora do escopo deste
  projeto.
- **Limite de payload dos eventos do Pusher:** mensagens de sinalização
  (`client-*`) têm limite de 10 KB cada. Ofertas/respostas SDP normalmente
  cabem tranquilamente nesse limite; candidatos ICE são enviados um a um
  (trickle ICE), então isso raramente é um problema.
- **Indicador de "quem está falando"** usa a Web Audio API para medir o
  volume de cada participante — é uma aproximação simples, não detecção de
  voz avançada.
- **Sem gravação de chamada** e **sem chat de texto** — não fazem parte do
  escopo pedido.

---

## Estrutura do projeto

```
videochamada/
├── app/
│   ├── api/
│   │   ├── pusher/auth/route.ts      # autoriza entrada no canal de presença
│   │   └── turn-credentials/route.ts # gera credenciais TURN no servidor
│   ├── sala/[roomId]/
│   │   ├── page.tsx                  # rota da sala
│   │   └── RoomClient.tsx            # orquestra sinalização + WebRTC + UI
│   ├── layout.tsx
│   ├── page.tsx                      # página inicial (criar/entrar)
│   └── globals.css
├── components/
│   ├── PreJoin.tsx                   # pré-entrada: testar câmera/mic + nome
│   ├── Controls.tsx                  # barra de controles da chamada
│   ├── VideoTile.tsx                 # vídeo de um participante
│   ├── ParticipantsGrid.tsx
│   ├── ParticipantsPanel.tsx
│   ├── ErrorBanner.tsx
│   └── icons.tsx
├── lib/
│   ├── webrtc.ts                     # gerenciador das conexões WebRTC (mesh)
│   ├── pusherClient.ts               # cliente Pusher (navegador)
│   ├── roomId.ts                     # geração/validação de código de sala
│   └── types.ts
├── .env.example
└── README.md
```

---

## Ao terminar de configurar

Depois de preencher as variáveis do Pusher (obrigatórias) e, se possível, do
TURN (recomendado), o app está pronto para chamadas reais entre dispositivos
diferentes — inclusive em redes diferentes — assim que estiver publicado na
Vercel (HTTPS automático, exigido pelo navegador para câmera, microfone e
compartilhamento de tela em produção).
